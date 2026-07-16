// Backfill monthly_metrics for past months — from backfillable sources ONLY.
//
// What can be reconstructed after the fact:
//   - website.pageviews / google_referrals   ← page_views rows (exact, from our log)
//   - website.email_signups                  ← email_subscribers.created_at (exact)
//   - per-platform post aggregates + avg reel views
//                                            ← posts.social_metrics grouped by
//                                              published_at month. Per-post insights
//                                              are LIFETIME numbers, so these are
//                                              tagged 'backfilled_lifetime'.
//   - business.revenue / orders              ← Printful order feed (exact)
//   - business.posts_published               ← posts count (exact)
//
// What CANNOT be reconstructed (Meta retains ~30 days of account insights, and
// follower counts have no history): IG/FB/Threads account-level reach, views,
// profile views, website clicks, followers → NULL, meta 'unavailable:no_snapshot'.
// GA4 fields (users/sessions/…) → NULL, meta 'pending_ga4'.
//
// HOW TO RUN (never runs automatically):
//   cd workspace-kumolab
//   node scripts/backfill-monthly-metrics.mjs                # all months, oldest data → last month
//   node scripts/backfill-monthly-metrics.mjs --from 2026-04 --to 2026-06
//   node scripts/backfill-monthly-metrics.mjs --force        # overwrite months that already have a row
//   node scripts/backfill-monthly-metrics.mjs --dry-run      # compute + print, write nothing
//
// Env (read from .env.local / .env): NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, PRINTFUL_ACCESS_TOKEN (optional — revenue becomes
// unavailable without it). Requires the monthly_metrics migration to be applied.
//
// Safe by default: months that already have a row (e.g. captured live by the
// cron) are SKIPPED unless --force, so a backfill can never clobber a richer
// live snapshot with a thinner backfilled one.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (put them in .env.local).');
    process.exit(1);
}
const db = createClient(url, key);

const PRINTFUL_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN;

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const FORCE = flag('--force');
const DRY = flag('--dry-run');

// ── month helpers (all UTC) ──────────────────────────────────────────────────
const monthStart = (y, m) => new Date(Date.UTC(y, m, 1));
const parseMonth = (s) => {
    const m = /^(\d{4})-(\d{2})/.exec(s || '');
    return m ? monthStart(Number(m[1]), Number(m[2]) - 1) : null;
};
const addMonths = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const monthKey = (d) => d.toISOString().slice(0, 10);
const label = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// ── source queries ───────────────────────────────────────────────────────────

async function earliestDataMonth() {
    const firsts = await Promise.all([
        db.from('page_views').select('timestamp').order('timestamp', { ascending: true }).limit(1),
        db.from('posts').select('published_at').eq('status', 'published').not('published_at', 'is', null)
            .order('published_at', { ascending: true }).limit(1),
    ]);
    const dates = [];
    const pv = firsts[0].data?.[0]?.timestamp;
    const po = firsts[1].data?.[0]?.published_at;
    if (pv) dates.push(new Date(pv));
    if (po) dates.push(new Date(po));
    if (dates.length === 0) return null;
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    return monthStart(min.getUTCFullYear(), min.getUTCMonth());
}

async function count(table, build) {
    let q = db.from(table).select('id', { count: 'exact', head: true });
    q = build(q);
    const { count: c, error } = await q;
    return error ? null : c ?? 0;
}

async function postAggregates(startIso, endIso) {
    const { data, error, count: published } = await db
        .from('posts')
        .select('social_metrics, social_ids', { count: 'exact' })
        .eq('status', 'published')
        .gte('published_at', startIso)
        .lt('published_at', endIso)
        .limit(2000);
    if (error) return null;

    const empty = () => ({ count: 0, views: null, likes: null, comments: null, avg_views: null });
    const agg = { instagram: empty(), facebook: empty(), threads: empty() };
    let reelViews = 0, reelCount = 0;
    for (const p of data || []) {
        const m = p.social_metrics || {};
        const isVideo = Boolean(p.social_ids?.staged_video_url);
        for (const platform of ['instagram', 'facebook', 'threads']) {
            const pm = m[platform];
            if (!pm) continue;
            const a = agg[platform];
            a.count++;
            a.views = (a.views ?? 0) + (Number(pm.views) || 0);
            a.likes = (a.likes ?? 0) + (Number(pm.likes) || 0);
            a.comments = (a.comments ?? 0) + (Number(pm.comments) || 0);
        }
        if (isVideo && m.instagram && Number(m.instagram.views) > 0) {
            reelViews += Number(m.instagram.views);
            reelCount++;
        }
    }
    for (const platform of ['instagram', 'facebook', 'threads']) {
        const a = agg[platform];
        a.avg_views = a.count > 0 && a.views != null ? Math.round(a.views / a.count) : null;
    }
    return {
        published: published ?? (data?.length || 0),
        ...agg,
        avgReelViews: reelCount > 0 ? Math.round(reelViews / reelCount) : null,
    };
}

/** All non-canceled Printful orders, fetched once and bucketed per month. */
async function fetchAllOrders() {
    if (!PRINTFUL_TOKEN) return null;
    const collected = [];
    let offset = 0;
    try {
        for (;;) {
            const res = await fetch(`https://api.printful.com/orders?offset=${offset}&limit=100`, {
                headers: { Authorization: `Bearer ${PRINTFUL_TOKEN}` },
            });
            if (!res.ok) return collected.length ? collected : null;
            const data = await res.json();
            const batch = Array.isArray(data.result) ? data.result : [];
            collected.push(...batch);
            const total = data.paging?.total ?? collected.length;
            offset += 100;
            if (batch.length < 100 || offset >= total) break;
        }
    } catch {
        return collected.length ? collected : null;
    }
    const CANCELED = new Set(['canceled', 'cancelled', 'failed']);
    return collected
        .filter((o) => !CANCELED.has(String(o.status || '').toLowerCase()))
        .map((o) => ({
            createdAt: Number(o.created) > 0 ? new Date(Number(o.created) * 1000).toISOString() : '',
            total: parseFloat((o.retail_costs || o.costs || {}).total || '0') || 0,
            currency: (o.retail_costs || o.costs || {}).currency || 'USD',
        }));
}

// ── per-month row builder ────────────────────────────────────────────────────

async function buildMonth(start, orders) {
    const end = addMonths(start, 1);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const meta = {};
    const put = (section, k, prov) => { meta[`${section}.${k}`] = prov; };

    const [pageviews, googleReferrals, emailSignups, aggs] = await Promise.all([
        count('page_views', (q) => q.eq('is_bot', false).gte('timestamp', startIso).lt('timestamp', endIso)),
        count('page_views', (q) => q.eq('is_bot', false).ilike('referrer', '%google.%').gte('timestamp', startIso).lt('timestamp', endIso)),
        count('email_subscribers', (q) => q.gte('created_at', startIso).lt('created_at', endIso)),
        postAggregates(startIso, endIso),
    ]);

    const website = {
        pageviews, google_referrals: googleReferrals, email_signups: emailSignups,
        email_signup_events: null, users: null, sessions: null, returning_users: null, avg_session_sec: null,
    };
    put('website', 'pageviews', pageviews != null ? 'exact' : 'unavailable:query_failed');
    put('website', 'google_referrals', googleReferrals != null ? 'exact' : 'unavailable:query_failed');
    put('website', 'email_signups', emailSignups != null ? 'exact' : 'unavailable:query_failed');
    put('website', 'email_signup_events', 'unavailable:no_snapshot');
    for (const k of ['users', 'sessions', 'returning_users', 'avg_session_sec']) put('website', k, 'pending_ga4');

    // Account-level metrics for past months are gone (no snapshot was taken).
    const NO_SNAP = 'unavailable:no_snapshot';
    const instagram = {
        followers: null, reach: null, views: null, profile_views: null, website_clicks: null,
        interactions: null, accounts_engaged: null, engagement_rate: null,
        avg_reel_views: aggs?.avgReelViews ?? null,
        posts: aggs?.instagram ?? null,
    };
    for (const k of ['followers', 'reach', 'views', 'profile_views', 'website_clicks', 'interactions', 'accounts_engaged', 'engagement_rate']) put('instagram', k, NO_SNAP);
    put('instagram', 'avg_reel_views', aggs?.avgReelViews != null ? 'backfilled_lifetime' : 'unavailable:no_synced_reels');
    put('instagram', 'posts', aggs ? 'backfilled_lifetime' : 'unavailable:query_failed');

    const facebook = { followers: null, views: null, engagement: null, reach: null, posts: aggs?.facebook ?? null };
    for (const k of ['followers', 'views', 'engagement', 'reach']) put('facebook', k, NO_SNAP);
    put('facebook', 'posts', aggs ? 'backfilled_lifetime' : 'unavailable:query_failed');

    const threads = { followers: null, views: null, engagement: null, posts: aggs?.threads ?? null };
    for (const k of ['followers', 'views', 'engagement']) put('threads', k, NO_SNAP);
    put('threads', 'posts', aggs ? 'backfilled_lifetime' : 'unavailable:query_failed');

    const youtube = { subscribers: null, views: null, watch_time_hours: null };
    for (const k of Object.keys(youtube)) put('youtube', k, 'unavailable:not_wired');

    let revenue = null, orderCount = null, currency = 'USD';
    if (orders) {
        const inMonth = orders.filter((o) => o.createdAt >= startIso && o.createdAt < endIso);
        revenue = Math.round(inMonth.reduce((s, o) => s + o.total, 0) * 100) / 100;
        orderCount = inMonth.length;
        currency = orders[0]?.currency || 'USD';
    }
    const business = { revenue, orders: orderCount, currency, posts_published: aggs?.published ?? null };
    put('business', 'revenue', orders ? 'exact' : 'unavailable:printful_unreachable');
    put('business', 'orders', orders ? 'exact' : 'unavailable:printful_unreachable');
    put('business', 'posts_published', aggs ? 'exact' : 'unavailable:query_failed');

    const fmt = (n) => (n == null ? 'n/a' : Math.round(n).toLocaleString('en-US'));
    const bits = [];
    if (business.posts_published != null) {
        const reel = instagram.avg_reel_views != null ? `, avg reel ${fmt(instagram.avg_reel_views)} views (lifetime)` : '';
        bits.push(`${fmt(business.posts_published)} posts published${reel}.`);
    }
    if (instagram.posts?.views != null) bits.push(`IG post views ${fmt(instagram.posts.views)} (lifetime).`);
    if (website.pageviews != null) {
        const org = website.google_referrals != null ? ` (${fmt(website.google_referrals)} via Google)` : '';
        bits.push(`Site ${fmt(website.pageviews)} pageviews${org}.`);
    }
    if (website.email_signups != null) bits.push(`${fmt(website.email_signups)} email signups.`);
    if (revenue != null) bits.push(`Revenue $${revenue.toFixed(2)} across ${fmt(orderCount)} orders.`);
    const analysis = `${label(start)} (backfilled): ${bits.join(' ')}`.trim();

    return {
        month: monthKey(start),
        captured_at: new Date().toISOString(),
        website, instagram, facebook, threads, youtube, business, meta, analysis,
    };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const prevMonth = addMonths(monthStart(new Date().getUTCFullYear(), new Date().getUTCMonth()), -1);
    const from = parseMonth(opt('--from')) || (await earliestDataMonth());
    const to = parseMonth(opt('--to')) || prevMonth;
    if (!from) {
        console.error('No data found to backfill (page_views and posts are both empty).');
        process.exit(1);
    }
    if (to > prevMonth) {
        console.error(`--to ${monthKey(to)} is not a completed month; latest allowed is ${monthKey(prevMonth)}.`);
        process.exit(1);
    }

    console.log(`Backfilling monthly_metrics ${monthKey(from)} → ${monthKey(to)}${DRY ? ' (dry run)' : ''}${FORCE ? ' (force)' : ''}`);
    const orders = await fetchAllOrders();
    if (!orders) console.warn('Printful unreachable or PRINTFUL_ACCESS_TOKEN unset — revenue will be unavailable.');

    let written = 0, skipped = 0;
    for (let m = from; m <= to; m = addMonths(m, 1)) {
        const key = monthKey(m);
        if (!FORCE) {
            const { data } = await db.from('monthly_metrics').select('id').eq('month', key).maybeSingle();
            if (data) {
                console.log(`  ${key}  SKIP (row exists — use --force to overwrite)`);
                skipped++;
                continue;
            }
        }
        const row = await buildMonth(m, orders);
        if (DRY) {
            console.log(`  ${key}  ${row.analysis}`);
            continue;
        }
        const { error } = await db.from('monthly_metrics').upsert(row, { onConflict: 'month' });
        if (error) {
            console.error(`  ${key}  FAILED: ${error.message}`);
        } else {
            console.log(`  ${key}  OK — ${row.analysis}`);
            written++;
        }
    }
    console.log(`Done. ${written} written, ${skipped} skipped.`);
}

main().catch((e) => {
    console.error('Backfill crashed:', e);
    process.exit(1);
});
