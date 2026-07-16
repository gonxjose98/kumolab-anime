// Monthly analytics snapshot → monthly_metrics (Phase 1 of monthly reporting).
//
// captureMonthlySnapshot(month) computes one calendar month's numbers from the
// sources we already have and UPSERTs the row keyed on `month` (first of the
// reported month). Designed to run from the `monthly-snapshot` cron on the 1st
// (capturing the just-finished month) or on demand from the admin analytics
// page ("Snapshot now").
//
// Provenance: every metric in the row is nullable — NULL means "not measured",
// never 0. The `meta` jsonb records, per metric, how the number was obtained:
//   exact                — measured for exactly this month
//   trailing30_approx    — trailing-30-day API window standing in for the month
//                          (Meta caps account insights at 30 days, and only the
//                          most recent 30 days are retrievable at all)
//   backfilled_lifetime  — summed from lifetime per-post insights grouped by
//                          publish month (metrics-sync data); close to exact for
//                          a month captured right after it ends
//   pending_ga4          — placeholder until the GA4 Data API pull lands
//   unavailable:<reason> — cannot be measured (e.g. the month is too far past
//                          Meta's retention and no snapshot was taken in time)

import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchIGDashboardData } from '@/lib/social/ig-insights';
import { fetchFacebookSnapshot, fetchThreadsSnapshot } from '@/lib/social/social-insights';
import { fetchOrders } from '@/lib/orders';
import { fetchGa4MonthMetrics, GA4_MIN_MONTH } from '@/lib/analytics/ga4';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_IG_ID = process.env.META_IG_ID;
const GRAPH = 'https://graph.facebook.com/v22.0';

export type Provenance =
    | 'exact'
    | 'trailing30_approx'
    | 'backfilled_lifetime'
    | 'pending_ga4'
    | `unavailable:${string}`;

interface PostAgg {
    count: number;
    views: number | null;
    likes: number | null;
    comments: number | null;
    avg_views: number | null;
}

export interface MonthlySnapshotRow {
    month: string; // YYYY-MM-01
    captured_at: string;
    website: Record<string, unknown>;
    instagram: Record<string, unknown>;
    facebook: Record<string, unknown>;
    threads: Record<string, unknown>;
    youtube: Record<string, unknown>;
    business: Record<string, unknown>;
    meta: Record<string, Provenance>;
    analysis: string;
}

export interface SnapshotResult {
    ok: boolean;
    month: string;
    reason?: string;
    row?: MonthlySnapshotRow;
}

// ── Month helpers ────────────────────────────────────────────────────────────

/** First day (00:00 UTC) of the month containing `d`. */
function monthStartUTC(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First day of the month before `d`'s month — the default snapshot target. */
export function previousMonthStart(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

function addMonths(start: Date, n: number): Date {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, 1));
}

function monthKey(start: Date): string {
    return start.toISOString().slice(0, 10); // YYYY-MM-01
}

function monthLabel(start: Date): string {
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ── Formatting helpers for the analysis template ─────────────────────────────

const fmt = (n: number | null | undefined) => (n == null ? 'n/a' : Math.round(n).toLocaleString('en-US'));
const money = (n: number | null | undefined, ccy = 'USD') =>
    n == null ? 'n/a' : new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy }).format(n);
const mom = (cur: number | null | undefined, prev: number | null | undefined): string => {
    if (cur == null || prev == null || prev === 0) return '';
    const pct = ((cur - prev) / prev) * 100;
    return ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% MoM)`;
};

// ── Supabase counting helpers (head:true → count only, no rows) ──────────────

async function countPageViews(startIso: string, endIso: string, googleOnly = false): Promise<number | null> {
    try {
        let q = supabaseAdmin
            .from('page_views')
            .select('id', { count: 'exact', head: true })
            .eq('is_bot', false)
            .gte('timestamp', startIso)
            .lt('timestamp', endIso);
        // Organic-search approximation: referrer host contains "google." — we
        // don't have GA4 sessions yet, so a Google referrer is the best signal.
        if (googleOnly) q = q.ilike('referrer', '%google.%');
        const { count, error } = await q;
        return error ? null : count ?? 0;
    } catch {
        return null;
    }
}

async function countEmailSignups(startIso: string, endIso: string): Promise<number | null> {
    try {
        const { count, error } = await supabaseAdmin
            .from('email_subscribers')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso);
        return error ? null : count ?? 0;
    } catch {
        return null;
    }
}

async function countSignupEvents(startIso: string, endIso: string): Promise<number | null> {
    try {
        const { count, error } = await supabaseAdmin
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'email_signup')
            .eq('is_bot', false)
            .gte('created_at', startIso)
            .lt('created_at', endIso);
        return error ? null : count ?? 0;
    } catch {
        return null;
    }
}

// ── Per-post aggregates from posts.social_metrics (metrics-sync data) ────────

export interface MonthPostAggs {
    published: number;
    instagram: PostAgg;
    facebook: PostAgg;
    threads: PostAgg;
    avgReelViews: number | null;
}

const EMPTY_AGG: PostAgg = { count: 0, views: null, likes: null, comments: null, avg_views: null };

/**
 * Aggregate per-post social metrics for posts published inside the month.
 * Per-post insights are LIFETIME numbers (not month-bounded), so callers tag
 * these 'backfilled_lifetime' — for a month captured right after it closes
 * they are near-exact, since most views accrue in the first days.
 */
export async function aggregatePostMetrics(startIso: string, endIso: string): Promise<MonthPostAggs | null> {
    try {
        const { data, error, count } = await supabaseAdmin
            .from('posts')
            .select('social_metrics, social_ids', { count: 'exact' })
            .eq('status', 'published')
            .gte('published_at', startIso)
            .lt('published_at', endIso)
            .limit(2000);
        if (error) return null;

        const agg = { instagram: { ...EMPTY_AGG }, facebook: { ...EMPTY_AGG }, threads: { ...EMPTY_AGG } };
        let reelViews = 0;
        let reelCount = 0;
        for (const p of data || []) {
            const m: any = p.social_metrics || {};
            const isVideo = !!(p.social_ids as any)?.staged_video_url;
            for (const platform of ['instagram', 'facebook', 'threads'] as const) {
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
        for (const platform of ['instagram', 'facebook', 'threads'] as const) {
            const a = agg[platform];
            a.avg_views = a.count > 0 && a.views != null ? Math.round(a.views / a.count) : null;
        }
        return {
            published: count ?? (data?.length || 0),
            ...agg,
            avgReelViews: reelCount > 0 ? Math.round(reelViews / reelCount) : null,
        };
    } catch {
        return null;
    }
}

// ── Instagram account insights for an explicit month range ──────────────────
//
// Meta allows at most 30 days between since/until per call, so a 31-day month
// is split into two chunks and summed. That is correct for volume metrics
// (views, profile_views, website_clicks, total_interactions) but would double
// count unique-account metrics (reach, accounts_engaged) — those get a single
// capped-at-30-days call instead, tagged trailing30_approx for 31-day months.
// Meta also only retains ~30 days of account insights, so ranged calls for
// older months come back empty → callers degrade or mark unavailable.

const IG_SUMMABLE = ['views', 'profile_views', 'website_clicks', 'total_interactions'] as const;
const IG_UNIQUE = ['reach', 'accounts_engaged'] as const;

async function igMetricWindow(name: string, since: number, until: number): Promise<number | null> {
    try {
        const url = `${GRAPH}/${META_IG_ID}/insights?metric=${name}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`;
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (j?.error || !Array.isArray(j?.data)) return null;
        for (const row of j.data) {
            if (row?.name !== name) continue;
            const total = row?.total_value?.value;
            if (typeof total === 'number') return total;
            if (Array.isArray(row?.values)) {
                return row.values.reduce((acc: number, v: any) => acc + (Number(v?.value) || 0), 0);
            }
        }
        return null;
    } catch {
        return null;
    }
}

interface IGRangeResult {
    values: Record<string, number | null>;
    provenance: Record<string, Provenance>;
}

async function fetchIGMonthMetrics(start: Date, end: Date): Promise<IGRangeResult> {
    const values: Record<string, number | null> = {};
    const provenance: Record<string, Provenance> = {};
    if (!META_ACCESS_TOKEN || !META_IG_ID) {
        for (const name of [...IG_SUMMABLE, ...IG_UNIQUE]) {
            values[name] = null;
            provenance[name] = 'unavailable:meta_env_missing';
        }
        return { values, provenance };
    }

    const startSec = Math.floor(start.getTime() / 1000);
    const endSec = Math.floor(end.getTime() / 1000);
    const days = Math.round((endSec - startSec) / 86400);
    const THIRTY = 30 * 86400;

    await Promise.all([
        // Volume metrics: split >30-day months into two chunks and sum → exact.
        ...IG_SUMMABLE.map(async (name) => {
            if (days <= 30) {
                const v = await igMetricWindow(name, startSec, endSec);
                values[name] = v;
                provenance[name] = v != null ? 'exact' : 'unavailable:graph_empty';
                return;
            }
            const mid = startSec + THIRTY;
            const [a, b] = await Promise.all([
                igMetricWindow(name, startSec, mid),
                igMetricWindow(name, mid, endSec),
            ]);
            if (a == null && b == null) {
                values[name] = null;
                provenance[name] = 'unavailable:graph_empty';
            } else {
                values[name] = (a ?? 0) + (b ?? 0);
                provenance[name] = a != null && b != null ? 'exact' : 'trailing30_approx';
            }
        }),
        // Unique-account metrics: cannot be summed across windows; a 31-day
        // month gets the first 30 days only → tagged trailing30_approx.
        ...IG_UNIQUE.map(async (name) => {
            const until = Math.min(endSec, startSec + THIRTY);
            const v = await igMetricWindow(name, startSec, until);
            values[name] = v;
            provenance[name] = v == null ? 'unavailable:graph_empty' : days <= 30 ? 'exact' : 'trailing30_approx';
        }),
    ]);

    return { values, provenance };
}

// ── Revenue for the month (Printful order feed, same source as dashboard) ────

async function monthRevenue(startIso: string, endIso: string): Promise<{ revenue: number; orders: number; currency: string } | null> {
    try {
        const { orders, error } = await fetchOrders(500);
        if (error && orders.length === 0) return null;
        const inMonth = orders.filter(
            (o) => o.stage !== 'canceled' && o.createdAt && o.createdAt >= startIso && o.createdAt < endIso,
        );
        const revenue = inMonth.reduce((s, o) => s + (Number(o.total) || 0), 0);
        return {
            revenue: Math.round(revenue * 100) / 100,
            orders: inMonth.length,
            currency: orders[0]?.currency || 'USD',
        };
    } catch {
        return null;
    }
}

// ── Analysis template ────────────────────────────────────────────────────────

function buildAnalysis(
    label: string,
    row: MonthlySnapshotRow,
    prev: { instagram?: any; website?: any; business?: any } | null,
): string {
    const ig: any = row.instagram;
    const web: any = row.website;
    const biz: any = row.business;
    const parts: string[] = [];

    if (ig.reach != null || ig.views != null) {
        const bits: string[] = [];
        if (ig.reach != null) bits.push(`reach ${fmt(ig.reach)}${mom(ig.reach, prev?.instagram?.reach)}`);
        if (ig.views != null) bits.push(`views ${fmt(ig.views)}${mom(ig.views, prev?.instagram?.views)}`);
        if (ig.followers != null) bits.push(`${fmt(ig.followers)} followers`);
        if (ig.engagement_rate != null) bits.push(`${ig.engagement_rate}% engagement`);
        parts.push(`IG ${bits.join(', ')}.`);
    }
    if (biz.posts_published != null) {
        const reel = ig.avg_reel_views != null ? `, avg reel ${fmt(ig.avg_reel_views)} views` : '';
        parts.push(`${fmt(biz.posts_published)} posts published${reel}.`);
    }
    if (web.users != null || web.sessions != null) {
        const bits: string[] = [];
        if (web.users != null) bits.push(`${fmt(web.users)} users${mom(web.users, prev?.website?.users)}`);
        if (web.sessions != null) bits.push(`${fmt(web.sessions)} sessions${mom(web.sessions, prev?.website?.sessions)}`);
        if (web.returning_users != null) bits.push(`${fmt(web.returning_users)} returning`);
        if (web.organic_sessions != null) bits.push(`${fmt(web.organic_sessions)} organic`);
        if (web.avg_session_sec != null) bits.push(`${fmt(web.avg_session_sec)}s avg session`);
        parts.push(`GA4 ${bits.join(', ')}.`);
    }
    if (web.pageviews != null) {
        const org = web.google_referrals != null ? ` (${fmt(web.google_referrals)} via Google referrer)` : '';
        parts.push(`Site ${fmt(web.pageviews)} pageviews${mom(web.pageviews, prev?.website?.pageviews)}${org}.`);
    }
    if (web.email_signups != null) parts.push(`${fmt(web.email_signups)} email signups.`);
    if (biz.revenue != null) {
        parts.push(`Revenue ${money(biz.revenue, biz.currency)}${mom(biz.revenue, prev?.business?.revenue)} across ${fmt(biz.orders)} orders.`);
    }
    return `${label}: ${parts.join(' ')}`.trim();
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Capture one calendar month into monthly_metrics (UPSERT on `month`).
 *
 * @param monthDate any date inside the month to capture; defaults to the
 *                  previous full month. Time-of-day is ignored.
 *
 * Freshness rule: Meta's account-level windows (and the point-in-time follower
 * counts) only describe the requested month when the capture happens shortly
 * after the month ends. If we're more than FRESH_DAYS past month end, the
 * trailing-30 fallbacks are skipped and those metrics become
 * 'unavailable:no_snapshot' instead of silently wrong numbers.
 */
export async function captureMonthlySnapshot(monthDate?: Date | string): Promise<SnapshotResult> {
    const target = monthDate
        ? monthStartUTC(typeof monthDate === 'string' ? new Date(`${monthDate.slice(0, 10)}T00:00:00Z`) : monthDate)
        : previousMonthStart();
    if (Number.isNaN(target.getTime())) {
        return { ok: false, month: '', reason: `invalid month: ${String(monthDate)}` };
    }
    const start = target;
    const end = addMonths(start, 1);
    const now = new Date();
    if (end > now) {
        return { ok: false, month: monthKey(start), reason: 'month has not ended yet — snapshots cover full months only' };
    }
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const month = monthKey(start);

    // Point-in-time / trailing-window data only represents this month when we
    // capture close to its end (cron runs on the 1st; allow a grace window).
    const FRESH_DAYS = 10;
    const fresh = now.getTime() - end.getTime() <= FRESH_DAYS * 86_400_000;

    const meta: Record<string, Provenance> = {};
    const put = (section: string, key: string, prov: Provenance) => {
        meta[`${section}.${key}`] = prov;
    };

    // GA4 date range is inclusive on both ends ('YYYY-MM-DD'), so endDate is the
    // LAST day of the month (our `end` is exclusive = first of next month).
    const ga4Start = monthKey(start);
    const ga4End = new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10);

    // Fire everything in parallel.
    const [pageviews, googleReferrals, emailSignups, signupEvents, postAggs, igRange, igTrailing, fbSnap, thSnap, revenue, ga4] =
        await Promise.all([
            countPageViews(startIso, endIso),
            countPageViews(startIso, endIso, true),
            countEmailSignups(startIso, endIso),
            countSignupEvents(startIso, endIso),
            aggregatePostMetrics(startIso, endIso),
            fetchIGMonthMetrics(start, end),
            fresh ? fetchIGDashboardData(30).then((d) => d.snapshot).catch(() => null) : Promise.resolve(null),
            fresh ? fetchFacebookSnapshot(30).catch(() => null) : Promise.resolve(null),
            fresh ? fetchThreadsSnapshot(30).catch(() => null) : Promise.resolve(null),
            monthRevenue(startIso, endIso),
            fetchGa4MonthMetrics(ga4Start, ga4End).catch(() => null),
        ]);

    // ── website ──
    // First-party pageviews (from our page_views table) stay canonical; GA4
    // fills the metrics that table can't produce (users/sessions/returning/
    // duration/organic). GA4 only has data from mid-July 2026 on, so pre-launch
    // months come back null → tagged unavailable:pre_ga4 rather than fake zeros.
    const website: Record<string, unknown> = {
        pageviews,
        google_referrals: googleReferrals,
        email_signups: emailSignups,
        email_signup_events: signupEvents,
        users: ga4?.users ?? null,
        new_users: ga4?.new_users ?? null,
        sessions: ga4?.sessions ?? null,
        returning_users: ga4?.returning_users ?? null,
        avg_session_sec: ga4?.avg_session_sec ?? null,
        organic_sessions: ga4?.organic_google_sessions ?? null,
        ga4_pageviews: ga4?.pageviews ?? null,
    };
    put('website', 'pageviews', pageviews != null ? 'exact' : 'unavailable:query_failed');
    put('website', 'google_referrals', googleReferrals != null ? 'exact' : 'unavailable:query_failed');
    put('website', 'email_signups', emailSignups != null ? 'exact' : 'unavailable:query_failed');
    put('website', 'email_signup_events', signupEvents != null ? 'exact' : 'unavailable:query_failed');
    // GA4-sourced metrics: 'exact' when returned, 'unavailable:pre_ga4' for
    // months before the tag went live, else 'pending_ga4' (transient API miss —
    // a later re-capture of this month will fill it).
    const ga4Prov = (v: number | null | undefined): Provenance =>
        v != null ? 'exact' : ga4End < GA4_MIN_MONTH ? 'unavailable:pre_ga4' : 'pending_ga4';
    put('website', 'users', ga4Prov(ga4?.users));
    put('website', 'new_users', ga4Prov(ga4?.new_users));
    put('website', 'sessions', ga4Prov(ga4?.sessions));
    put('website', 'returning_users', ga4Prov(ga4?.returning_users));
    put('website', 'avg_session_sec', ga4Prov(ga4?.avg_session_sec));
    put('website', 'organic_sessions', ga4Prov(ga4?.organic_google_sessions));
    put('website', 'ga4_pageviews', ga4Prov(ga4?.pageviews));

    // ── instagram ──
    // Ranged month numbers when Meta still has them; degrade per-metric to the
    // trailing-30 snapshot (tagged trailing30_approx) only for a fresh capture.
    const igVal = (name: string, trailingValue: number | null | undefined): { v: number | null; p: Provenance } => {
        const ranged = igRange.values[name];
        const prov = igRange.provenance[name];
        if (ranged != null) return { v: ranged, p: prov };
        if (fresh && trailingValue != null) return { v: trailingValue, p: 'trailing30_approx' };
        return { v: null, p: prov?.startsWith('unavailable') ? (fresh ? prov : 'unavailable:no_snapshot') : 'unavailable:no_snapshot' };
    };
    const igReach = igVal('reach', igTrailing?.reach28d);
    const igViews = igVal('views', igTrailing?.views28d);
    const igProfileViews = igVal('profile_views', igTrailing?.profileViews28d);
    const igClicks = igVal('website_clicks', igTrailing?.websiteClicks28d);
    const igInteractions = igVal('total_interactions', igTrailing?.totalInteractions28d);
    const igEngaged = igVal('accounts_engaged', igTrailing?.accountsEngaged28d);
    const igFollowers = fresh ? igTrailing?.followers ?? null : null;
    const engagementRate =
        igInteractions.v != null && igReach.v ? Math.round((igInteractions.v / igReach.v) * 1000) / 10 : null;

    const instagram: Record<string, unknown> = {
        followers: igFollowers,
        reach: igReach.v,
        views: igViews.v,
        profile_views: igProfileViews.v,
        website_clicks: igClicks.v,
        interactions: igInteractions.v,
        accounts_engaged: igEngaged.v,
        engagement_rate: engagementRate, // % — interactions / reach
        avg_reel_views: postAggs?.avgReelViews ?? null,
        posts: postAggs?.instagram ?? null,
    };
    put('instagram', 'followers', igFollowers != null ? 'exact' : 'unavailable:no_snapshot');
    put('instagram', 'reach', igReach.p);
    put('instagram', 'views', igViews.p);
    put('instagram', 'profile_views', igProfileViews.p);
    put('instagram', 'website_clicks', igClicks.p);
    put('instagram', 'interactions', igInteractions.p);
    put('instagram', 'accounts_engaged', igEngaged.p);
    put('instagram', 'engagement_rate', engagementRate != null ? (igReach.p === 'exact' && igInteractions.p === 'exact' ? 'exact' : 'trailing30_approx') : 'unavailable:needs_reach_and_interactions');
    put('instagram', 'avg_reel_views', postAggs?.avgReelViews != null ? 'backfilled_lifetime' : 'unavailable:no_synced_reels');
    put('instagram', 'posts', postAggs ? 'backfilled_lifetime' : 'unavailable:query_failed');

    // ── facebook (trailing-30 account snapshot only; ranged FB not wired) ──
    const facebook: Record<string, unknown> = {
        followers: fresh ? fbSnap?.followers ?? null : null,
        views: fresh ? fbSnap?.views28d ?? null : null,
        engagement: fresh ? fbSnap?.engagement28d ?? null : null,
        reach: null,
        posts: postAggs?.facebook ?? null,
    };
    const fbFail: Provenance = fresh
        ? `unavailable:${(fbSnap?.reason || 'graph_empty').slice(0, 60)}`
        : 'unavailable:no_snapshot';
    put('facebook', 'followers', facebook.followers != null ? 'exact' : fbFail);
    put('facebook', 'views', facebook.views != null ? 'trailing30_approx' : fbFail);
    put('facebook', 'engagement', facebook.engagement != null ? 'trailing30_approx' : fbFail);
    put('facebook', 'reach', 'unavailable:not_wired');
    put('facebook', 'posts', postAggs ? 'backfilled_lifetime' : 'unavailable:query_failed');

    // ── threads (trailing-30 account snapshot only) ──
    const threads: Record<string, unknown> = {
        followers: fresh ? thSnap?.followers ?? null : null,
        views: fresh ? thSnap?.views28d ?? null : null,
        engagement: fresh ? thSnap?.engagement28d ?? null : null,
        posts: postAggs?.threads ?? null,
    };
    const thFail: Provenance = fresh
        ? `unavailable:${(thSnap?.reason || 'graph_empty').slice(0, 60)}`
        : 'unavailable:no_snapshot';
    put('threads', 'followers', threads.followers != null ? 'exact' : thFail);
    put('threads', 'views', threads.views != null ? 'trailing30_approx' : thFail);
    put('threads', 'engagement', threads.engagement != null ? 'trailing30_approx' : thFail);
    put('threads', 'posts', postAggs ? 'backfilled_lifetime' : 'unavailable:query_failed');

    // ── youtube (future phase) ──
    const youtube: Record<string, unknown> = { subscribers: null, views: null, watch_time_hours: null };
    for (const k of Object.keys(youtube)) put('youtube', k, 'unavailable:not_wired');

    // ── business ──
    const business: Record<string, unknown> = {
        revenue: revenue?.revenue ?? null,
        orders: revenue?.orders ?? null,
        currency: revenue?.currency ?? 'USD',
        posts_published: postAggs?.published ?? null,
    };
    put('business', 'revenue', revenue ? 'exact' : 'unavailable:printful_unreachable');
    put('business', 'orders', revenue ? 'exact' : 'unavailable:printful_unreachable');
    put('business', 'posts_published', postAggs ? 'exact' : 'unavailable:query_failed');

    const row: MonthlySnapshotRow = {
        month,
        captured_at: now.toISOString(),
        website,
        instagram,
        facebook,
        threads,
        youtube,
        business,
        meta,
        analysis: '',
    };

    // Prior month's row (if any) for MoM comparisons in the analysis text.
    let prevRow: any = null;
    try {
        const { data } = await supabaseAdmin
            .from('monthly_metrics')
            .select('instagram, website, business')
            .eq('month', monthKey(addMonths(start, -1)))
            .maybeSingle();
        prevRow = data ?? null;
    } catch {
        // no prior month — analysis just omits MoM deltas
    }
    row.analysis = buildAnalysis(monthLabel(start), row, prevRow);

    const { error } = await supabaseAdmin.from('monthly_metrics').upsert(row, { onConflict: 'month' });
    if (error) return { ok: false, month, reason: `upsert failed: ${error.message}`, row };
    return { ok: true, month, row };
}
