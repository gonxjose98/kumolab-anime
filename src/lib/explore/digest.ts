/**
 * Digest builders: all arithmetic happens here, in code, before the model sees
 * anything. The model only phrases finished figures and cites them by ref.
 *
 * Server-only (Supabase service role). Each builder tolerates missing tables
 * (release_radar / wire_items may not exist yet) and reports gaps in `missing`.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Digest, SourceRef } from './types';
import type { SystemReport } from './system';

const DAY_MS = 86_400_000;
const nf = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
const signed = (p: number | null) => (p === null ? 'n/a' : `${p > 0 ? '+' : ''}${p}%`);
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
/** "Oct 8" for a UTC day key. */
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Oct 8" in New York time for an instant. */
const etDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const etTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const etHour = (iso: string) => Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })) % 24;

export function median(xs: number[]): number | null {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function isMissingTable(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '');
}

const PNAME: Record<string, string> = { instagram: 'Instagram', threads: 'Threads', website: 'Website', x: 'X' };
const clean = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ── Our numbers ─────────────────────────────────────────────────────────────

type PostRow = {
    id: string; title: string | null; claim_type: string | null; type: string | null; published_at: string;
    social_metrics: Record<string, any> | null; social_ids: Record<string, any> | null;
    slides: unknown; vp: unknown;
};

export function postFormat(p: Pick<PostRow, 'slides' | 'vp' | 'social_ids'>): 'carousel' | 'reel' | 'image' {
    if (Array.isArray(p.slides) && p.slides.length > 0) return 'carousel';
    if (p.social_ids?.staged_video_url || (p.vp && typeof p.vp === 'object')) return 'reel';
    return 'image';
}

/**
 * Views per platform from daily_views: last 7 vs prior 7 and last 30 vs prior 30.
 * Also used on page load for the deterministic "last 7 days" glance.
 */
export async function viewsDigest(now = Date.now()): Promise<{ views: Record<string, any>; refs: Record<string, SourceRef> }> {
    // Views per platform, from daily_views. Windows end on the last complete
    // UTC day that has data (IG/Threads lag a day; today is always partial).
    const since = dayKey(now - 62 * DAY_MS);
    const yesterday = dayKey(now - DAY_MS);
    const { data: dv } = await supabaseAdmin.from('daily_views').select('day, platform, views').gte('day', since).limit(2000);
    const byPlatform = new Map<string, Map<string, number>>();
    for (const r of dv || []) {
        if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, new Map());
        byPlatform.get(r.platform)!.set(String(r.day), Number(r.views) || 0);
    }
    const views: Record<string, unknown> = {};
    const refs: Record<string, SourceRef> = {};
    for (const [platform, days] of byPlatform) {
        const withData = [...days.entries()].filter(([d, v]) => v > 0 && d <= yesterday).map(([d]) => d).sort();
        const end = withData[withData.length - 1];
        if (!end) continue;
        const endT = Date.parse(`${end}T00:00:00Z`);
        const sum = (fromBack: number, len: number) => {
            let s = 0, have = 0;
            for (let i = fromBack; i < fromBack + len; i++) {
                const k = dayKey(endT - i * DAY_MS);
                if (days.has(k)) { s += days.get(k)!; have++; }
            }
            return { s, have };
        };
        const w7 = sum(0, 7), p7 = sum(7, 7), w30 = sum(0, 30), p30 = sum(30, 30);
        const name = PNAME[platform] || platform;
        const start7 = dayLabel(dayKey(endT - 6 * DAY_MS));
        const entry: Record<string, unknown> = { data_through: dayLabel(end) };
        if (w7.have >= 7 && p7.have >= 7) {
            const ref = `views:${platform}:7d`;
            const change = pct(w7.s, p7.s);
            refs[ref] = {
                kind: 'metric', label: `${name} views, week over week`,
                text: `${name} views ${start7} to ${dayLabel(end)}: ${nf(w7.s)}, prior 7 days: ${nf(p7.s)} (${signed(change)})`,
                values: [w7.s, p7.s, ...(change === null ? [] : [change])],
            };
            entry.week = { ref, last_7d: w7.s, prior_7d: p7.s, change_pct: change };
        }
        if (w30.have >= 28 && p30.have >= 28) {
            const ref = `views:${platform}:30d`;
            const change = pct(w30.s, p30.s);
            refs[ref] = {
                kind: 'metric', label: `${name} views, last 30 days vs prior 30`,
                text: `${name} views last 30 days (through ${dayLabel(end)}): ${nf(w30.s)}, prior 30 days: ${nf(p30.s)} (${signed(change)})`,
                values: [w30.s, p30.s, ...(change === null ? [] : [change])],
            };
            entry.month = { ref, last_30d: w30.s, prior_30d: p30.s, change_pct: change };
        }
        views[platform] = entry;
    }
    return { views, refs };
}

export async function buildOursDigest(dismissedTitles: string[] = []): Promise<Digest> {
    const now = Date.now();
    const refs: Record<string, SourceRef> = {};
    const facts: Record<string, unknown> = {};
    const missing: string[] = [];

    const { views, refs: viewRefs } = await viewsDigest(now);
    Object.assign(refs, viewRefs);
    if (!Object.keys(views).length) missing.push('daily views');
    facts.views = views;

    // Posts that actually went out in the last 30 days.
    const from30 = new Date(now - 30 * DAY_MS).toISOString();
    const { data: postsRaw } = await supabaseAdmin
        .from('posts')
        .select('id, title, claim_type, type, published_at, social_metrics, social_ids, slides:image_settings->slides, vp:image_settings->video_project')
        .eq('status', 'published')
        .gte('published_at', from30)
        .order('published_at', { ascending: false })
        .limit(400);
    const all = (postsRaw || []) as PostRow[];
    const sent = all.filter((p) => p.social_ids?.instagram_id || p.social_ids?.threads_id);
    const igOf = (p: PostRow) => p.social_metrics?.instagram as { views?: number; reach?: number; likes?: number; comments?: number } | undefined;
    const thOf = (p: PostRow) => p.social_metrics?.threads as { views?: number } | undefined;
    const withIg = sent.filter((p) => igOf(p) && typeof igOf(p)!.views === 'number');

    refs.coverage = {
        kind: 'metric', label: 'Post coverage, last 30 days',
        text: `${nf(all.length)} posts published in the last 30 days; ${nf(sent.length)} went to Instagram or Threads; ${nf(withIg.length)} have synced Instagram metrics`,
        values: [all.length, sent.length, withIg.length],
    };
    facts.coverage = { ref: 'coverage', published: all.length, sent_to_social: sent.length, with_ig_metrics: withIg.length };

    // Format performance (reel / carousel / image), derived per the spec rule.
    const formats: Record<string, unknown> = {};
    const FNAME = { reel: 'Reels', carousel: 'Carousels', image: 'Image posts' } as const;
    const medByFormat: Record<string, number | null> = {};
    for (const f of ['reel', 'carousel', 'image'] as const) {
        const ps = withIg.filter((p) => postFormat(p) === f);
        if (!ps.length) continue;
        const mv = median(ps.map((p) => igOf(p)!.views || 0));
        const mr = median(ps.map((p) => igOf(p)!.reach || 0));
        const mt = median(ps.map((p) => thOf(p)?.views || 0));
        medByFormat[f] = mv;
        const ref = `format:${f}`;
        refs[ref] = {
            kind: 'metric', label: `${FNAME[f]}, last 30 days`,
            text: `${FNAME[f]} in the last 30 days: ${ps.length} posts with metrics, median Instagram views ${nf(mv ?? 0)}, median Instagram reach ${nf(mr ?? 0)}, median Threads views ${nf(mt ?? 0)}`,
            values: [ps.length, mv ?? 0, mr ?? 0, mt ?? 0],
        };
        formats[f] = { ref, n: ps.length, median_ig_views: mv, median_ig_reach: mr, median_threads_views: mt, small_sample: ps.length < 5 };
    }
    const nReel = withIg.filter((p) => postFormat(p) === 'reel').length;
    const nCar = withIg.filter((p) => postFormat(p) === 'carousel').length;
    if (nReel >= 5 && nCar >= 5 && medByFormat.reel && medByFormat.carousel) {
        const ratio = Math.round((medByFormat.reel / medByFormat.carousel) * 10) / 10;
        refs['format:reel_vs_carousel'] = {
            kind: 'metric', label: 'Reels vs carousels, median Instagram views',
            text: `Median Instagram views, last 30 days: reels ${nf(medByFormat.reel)} vs carousels ${nf(medByFormat.carousel)} (${ratio}x). Note: Meta counts carousel views differently, so compare reach too`,
            values: [medByFormat.reel, medByFormat.carousel, ratio],
        };
        formats.reel_vs_carousel = { ref: 'format:reel_vs_carousel', ratio };
    }
    facts.format_perf_30d = formats;

    // Top / bottom posts, last 14 days, at least 24h old so numbers settled a bit.
    const from14 = now - 14 * DAY_MS, settled = now - DAY_MS;
    const recent = withIg.filter((p) => { const t = Date.parse(p.published_at); return t >= from14 && t <= settled; });
    const postRef = (p: PostRow) => {
        const ref = `post:${p.id}`;
        const ig = igOf(p)!, th = thOf(p);
        const f = postFormat(p);
        refs[ref] = {
            kind: 'post', label: clean(p.title, 110) || '(untitled post)',
            url: p.social_ids?.instagram_url || p.social_ids?.threads_url || undefined,
            text: `${f === 'reel' ? 'Reel' : f === 'carousel' ? 'Carousel' : 'Image post'} published ${etDay(p.published_at)} at ${etTime(p.published_at)} ET: Instagram views ${nf(ig.views || 0)}, reach ${nf(ig.reach || 0)}, likes ${nf(ig.likes || 0)}, comments ${nf(ig.comments || 0)}; Threads views ${nf(th?.views || 0)}`,
            values: [ig.views || 0, ig.reach || 0, ig.likes || 0, ig.comments || 0, th?.views || 0],
        };
        return { ref, title: clean(p.title, 110), format: f, claim: p.claim_type || p.type, ig_views: ig.views || 0, ig_reach: ig.reach || 0, threads_views: th?.views || 0 };
    };
    const sorted = [...recent].sort((a, b) => (igOf(b)!.views || 0) - (igOf(a)!.views || 0));
    facts.top_posts_14d = sorted.slice(0, 5).map(postRef);
    facts.bottom_posts_14d = sorted.length > 8 ? sorted.slice(-5).reverse().map(postRef) : [];

    // Posting time buckets (ET).
    const bucketOf = (h: number) => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'midday' : h >= 17 && h < 23 ? 'evening' : 'late_night');
    const BNAME: Record<string, string> = { morning: 'Morning (5 to 11 AM ET)', midday: 'Midday (11 AM to 5 PM ET)', evening: 'Evening (5 to 11 PM ET)', late_night: 'Late night (11 PM to 5 AM ET)' };
    const timing: Record<string, unknown> = {};
    for (const b of ['morning', 'midday', 'evening', 'late_night']) {
        const ps = withIg.filter((p) => bucketOf(etHour(p.published_at)) === b);
        if (ps.length < 3) continue;
        const mv = median(ps.map((p) => igOf(p)!.views || 0)) ?? 0;
        const ref = `timing:${b}`;
        refs[ref] = { kind: 'metric', label: `${BNAME[b]} posts, last 30 days`, text: `${BNAME[b]} posts, last 30 days: ${ps.length} posts, median Instagram views ${nf(mv)}`, values: [ps.length, mv] };
        timing[b] = { ref, n: ps.length, median_ig_views: mv };
    }
    facts.timing_30d = timing;

    // Claim / post type.
    const claims: Record<string, unknown> = {};
    const groups = new Map<string, PostRow[]>();
    for (const p of withIg) { const k = p.claim_type || p.type || 'OTHER'; groups.set(k, [...(groups.get(k) || []), p]); }
    for (const [k, ps] of groups) {
        if (ps.length < 3) continue;
        const mv = median(ps.map((p) => igOf(p)!.views || 0)) ?? 0;
        const ref = `claim:${k}`;
        refs[ref] = { kind: 'metric', label: `${k} posts, last 30 days`, text: `${k} posts, last 30 days: ${ps.length} posts, median Instagram views ${nf(mv)}`, values: [ps.length, mv] };
        claims[k] = { ref, n: ps.length, median_ig_views: mv };
    }
    facts.claim_perf_30d = claims;

    // Followers, monthly snapshots (the only follower history stored).
    const { data: mm } = await supabaseAdmin.from('monthly_metrics').select('month, instagram, threads').order('month', { ascending: false }).limit(2);
    const followers: Record<string, unknown> = {};
    if (mm && mm.length) {
        const mlabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        for (const plat of ['instagram', 'threads'] as const) {
            const cur = Number((mm[0] as any)[plat]?.followers);
            if (!Number.isFinite(cur)) continue;
            const prev = mm[1] ? Number((mm[1] as any)[plat]?.followers) : NaN;
            const ref = `followers:${plat}`;
            const name = PNAME[plat];
            const hasPrev = Number.isFinite(prev);
            refs[ref] = {
                kind: 'metric', label: `${name} followers, monthly snapshot`,
                text: hasPrev
                    ? `${name} followers: ${nf(cur)} at the ${mlabel(mm[0].month)} snapshot vs ${nf(prev)} at ${mlabel(mm[1].month)} (change ${cur - prev >= 0 ? '+' : ''}${nf(cur - prev)})`
                    : `${name} followers: ${nf(cur)} at the ${mlabel(mm[0].month)} snapshot`,
                values: hasPrev ? [cur, prev, cur - prev] : [cur],
            };
            followers[plat] = { ref, current: cur, previous: hasPrev ? prev : null };
        }
    } else {
        missing.push('follower snapshots');
    }
    missing.push('daily follower history');
    facts.followers = followers;
    facts.dismissed_recently = dismissedTitles.slice(0, 20);

    return { section: 'ours', generatedAt: new Date().toISOString(), facts, refs, missing, hasData: Object.keys(views).length > 0 || withIg.length > 0 };
}

// ── Anime world ─────────────────────────────────────────────────────────────

export async function buildWorldDigest(dismissedTitles: string[] = []): Promise<Digest> {
    const now = Date.now();
    const refs: Record<string, SourceRef> = {};
    const facts: Record<string, unknown> = {};
    const missing: string[] = ['community chatter (no X / Reddit source connected yet)'];

    // Release Radar (AniList).
    const radarRes = await supabaseAdmin
        .from('release_radar')
        .select('anilist_id, title_english, title_romaji, season_label, format, status, start_date, next_airing_at, next_episode, popularity, trending, favourites, average_score, streaming, prequel_title, prequel_end_date, site_url, anticipation_rank, studios')
        .order('anticipation_rank', { ascending: true, nullsFirst: false })
        .order('popularity', { ascending: false })
        .limit(20);
    const radar = isMissingTable(radarRes.error) ? [] : (radarRes.data || []);
    if (!radar.length) missing.push('release radar');
    facts.release_radar = radar.map((r: any) => {
        const ref = `anilist:${r.anilist_id}`;
        const title = r.title_english || r.title_romaji || `AniList ${r.anilist_id}`;
        const streaming = (Array.isArray(r.streaming) ? r.streaming : []).map((s: any) => s?.name || s?.site).filter(Boolean);
        const parts = [
            `${title}${r.season_label ? ` (${r.season_label}${r.format ? `, ${r.format}` : ''})` : ''}`,
            r.status ? `status ${r.status}` : null,
            r.start_date ? `starts ${new Date(`${r.start_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : null,
            r.next_airing_at ? `episode ${r.next_episode ?? '?'} airs ${etDay(r.next_airing_at)} at ${etTime(r.next_airing_at)} ET` : null,
            r.popularity != null ? `AniList popularity ${nf(r.popularity)}` : null,
            r.trending != null ? `AniList trending score ${nf(r.trending)}` : null,
            r.average_score != null ? `average score ${r.average_score}` : null,
            streaming.length ? `listed streaming on AniList: ${streaming.join(', ')}` : null,
            r.prequel_title ? `prequel ${r.prequel_title}${r.prequel_end_date ? ` ended ${new Date(`${r.prequel_end_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : ''}` : null,
            r.anticipation_rank != null ? `anticipation rank ${r.anticipation_rank}` : null,
        ].filter(Boolean);
        refs[ref] = {
            kind: 'anilist', label: title, url: r.site_url || `https://anilist.co/anime/${r.anilist_id}`,
            text: parts.join('; '),
            values: [r.popularity, r.trending, r.favourites, r.average_score, r.next_episode, r.anticipation_rank].filter((v) => typeof v === 'number'),
        };
        return { ref, title, season: r.season_label, status: r.status, start_date: r.start_date, next_airing_at: r.next_airing_at, popularity: r.popularity, trending: r.trending, streaming, anticipation_rank: r.anticipation_rank };
    });

    // Anime Wire: everything scraped in the last 72h.
    const since = new Date(now - 72 * 3600_000).toISOString();
    const wireRes = await supabaseAdmin
        .from('wire_items')
        .select('id, kind, title, url, source_name, published_at, detected_at, anime_title, summary')
        .gte('detected_at', since)
        .order('detected_at', { ascending: false })
        .limit(400);
    const wire = isMissingTable(wireRes.error) ? [] : (wireRes.data || []);
    if (!wire.length) missing.push('anime wire');

    const itemRef = (w: any) => {
        const ref = `wire:${w.id}`;
        const when = w.published_at || w.detected_at;
        refs[ref] = {
            kind: 'url', label: `${clean(w.source_name, 40)}: ${clean(w.title, 120)}`, url: w.url || undefined,
            text: `${clean(w.source_name, 40)} (${w.kind}), ${when ? `published ${etDay(when)}` : 'date unknown'}: ${clean(w.title, 160)}${w.summary ? `. Summary: ${clean(w.summary, 320)}` : ''}`,
            values: [],
        };
        return ref;
    };

    // Stories: items grouped by matched anime, ranked by distinct outlets.
    const groups = new Map<string, any[]>();
    for (const w of wire) {
        const k = clean(w.anime_title, 120).toLowerCase();
        if (!k) continue;
        groups.set(k, [...(groups.get(k) || []), w]);
    }
    const stories = [...groups.values()]
        .map((items) => ({ items, outlets: [...new Set(items.map((i) => clean(i.source_name, 40)))] }))
        .sort((a, b) => b.outlets.length - a.outlets.length || b.items.length - a.items.length)
        .slice(0, 15);
    facts.stories_72h = stories.map((s, i) => {
        const anime = clean(s.items[0].anime_title, 120);
        const ref = `story:${i + 1}`;
        refs[ref] = {
            kind: 'metric', label: `${anime}: coverage in the last 72 hours`,
            text: `${s.outlets.length} outlet${s.outlets.length === 1 ? '' : 's'} (${s.outlets.join(', ')}) posted ${s.items.length} item${s.items.length === 1 ? '' : 's'} about ${anime} in the last 72 hours`,
            values: [s.outlets.length, s.items.length],
        };
        return { ref, anime, outlets: s.outlets.length, items: s.items.length, item_refs: s.items.slice(0, 3).map(itemRef) };
    });
    const grouped = new Set(stories.flatMap((s) => s.items.slice(0, 3).map((i) => i.id)));
    facts.latest_items = wire.filter((w: any) => !grouped.has(w.id)).slice(0, 15).map((w: any) => ({ ref: itemRef(w), title: clean(w.title, 160), source: w.source_name, kind: w.kind, anime: w.anime_title || null }));

    // What we already posted, so the model can flag gaps without duplicating.
    const { data: ours } = await supabaseAdmin
        .from('posts').select('title').eq('status', 'published')
        .gte('published_at', new Date(now - 7 * DAY_MS).toISOString())
        .order('published_at', { ascending: false }).limit(40);
    const titles = (ours || []).map((p) => clean(p.title, 100)).filter(Boolean);
    refs['ours:posted7d'] = { kind: 'metric', label: 'KumoLab posts, last 7 days', text: `KumoLab published ${titles.length} posts in the last 7 days: ${titles.join(' | ')}`, values: [titles.length] };
    facts.already_posted_7d = { ref: 'ours:posted7d', titles };
    facts.dismissed_recently = dismissedTitles.slice(0, 20);

    return { section: 'world', generatedAt: new Date().toISOString(), facts, refs, missing, hasData: radar.length > 0 || wire.length > 0 };
}

// ── System ──────────────────────────────────────────────────────────────────

export function buildSystemDigest(report: SystemReport): Digest {
    const refs: Record<string, SourceRef> = {};
    const tokens = report.tokens.map((t) => {
        const ref = `token:${t.key}`;
        refs[ref] = {
            kind: 'system', label: t.label,
            text: `${t.label}: ${t.detail}${t.daysLeft !== null ? `; ${t.daysLeft} days left` : ''}`,
            values: t.daysLeft !== null ? [t.daysLeft] : [],
        };
        return { ref, level: t.level, days_left: t.daysLeft };
    });
    const checks = report.health.checks.map((c) => {
        const ref = `health:${c.key}`;
        refs[ref] = { kind: 'system', label: c.label, text: `${c.label} (${c.level}): ${c.detail}`, values: [] };
        return { ref, level: c.level };
    });
    refs['errors:24h'] = { kind: 'system', label: 'Errors, last 24 hours', text: `${report.errors24h} errors logged in the last 24 hours`, values: [report.errors24h] };
    const enabled = report.sources.filter((s) => s.is_enabled !== false).length;
    refs.sources = { kind: 'system', label: 'Source health', text: `${report.sourcesHealthy} of ${enabled} enabled sources healthy`, values: [report.sourcesHealthy, enabled] };
    return {
        section: 'system',
        generatedAt: new Date().toISOString(),
        facts: { tokens, checks, errors: { ref: 'errors:24h', count: report.errors24h }, sources: { ref: 'sources', healthy: report.sourcesHealthy, enabled } },
        refs,
        missing: [],
        hasData: true,
    };
}
