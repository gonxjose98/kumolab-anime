/**
 * Release Radar worker (cron `?worker=radar`).
 *
 * Pulls from AniList (free GraphQL, ~90 req/min; we stay far under it):
 *   1. airingSchedules with episode = 1 in the next 60 days (premieres)
 *   2. NOT_YET_RELEASED media with a startDate inside the next 60 days
 *   3. currently RELEASING shows by popularity (returning seasons mid-run)
 *   4. TRENDING top 20, written to wire_items as kind 'trending'
 *
 * Every chip is a plain fact derived from AniList fields. No adjectives.
 * Rows not seen in this run are deleted, so the table is always "now".
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { wireFingerprint, upsertWireItems, type WireItemInput } from './wire';

const ANILIST_URL = 'https://graphql.anilist.co';
const WINDOW_DAYS = 60;
const REQUEST_GAP_MS = 900; // ~66 req/min ceiling even if every call is back-to-back

const MEDIA_FIELDS = `
    id
    title { english romaji }
    format
    episodes
    status
    isAdult
    countryOfOrigin
    startDate { year month day }
    nextAiringEpisode { airingAt episode }
    popularity
    favourites
    trending
    averageScore
    studios(isMain: true) { nodes { name } }
    externalLinks { site url type }
    relations { edges { relationType node { id type format title { english romaji } endDate { year month day } siteUrl } } }
    coverImage { large }
    bannerImage
    siteUrl
    genres
`;

type FuzzyDate = { year: number | null; month: number | null; day: number | null } | null;

interface AniMedia {
    id: number;
    title: { english: string | null; romaji: string | null };
    format: string | null;
    episodes: number | null;
    status: string | null;
    isAdult: boolean;
    countryOfOrigin: string | null;
    startDate: FuzzyDate;
    nextAiringEpisode: { airingAt: number; episode: number } | null;
    popularity: number | null;
    favourites: number | null;
    trending: number | null;
    averageScore: number | null;
    studios: { nodes: { name: string }[] } | null;
    externalLinks: { site: string; url: string; type: string | null }[] | null;
    relations: { edges: { relationType: string; node: { id: number; type: string; format: string | null; title: { english: string | null; romaji: string | null }; endDate: FuzzyDate; siteUrl: string } }[] } | null;
    coverImage: { large: string | null } | null;
    bannerImage: string | null;
    siteUrl: string;
    genres: string[] | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;
async function anilist<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
    const wait = lastCall + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429 && attempt < 2) {
        const retryAfter = Number(res.headers.get('retry-after')) || 30;
        await sleep(Math.min(retryAfter, 60) * 1000);
        return anilist<T>(query, variables, attempt + 1);
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`AniList: ${json.errors[0]?.message}`);
    return json.data as T;
}

function fuzzyToIso(d: FuzzyDate): string | null {
    if (!d?.year) return null;
    const m = String(d.month || 1).padStart(2, '0');
    const day = String(d.day || 1).padStart(2, '0');
    return `${d.year}-${m}-${day}`;
}
const fuzzyInt = (date: Date) => date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

/** "Season 2" style label, only when the title itself says so. */
function seasonLabel(m: AniMedia): string | null {
    const t = `${m.title.english || ''} | ${m.title.romaji || ''}`;
    const patterns: [RegExp, (x: RegExpMatchArray) => string][] = [
        [/season\s*(\d+)/i, (x) => `Season ${x[1]}`],
        [/(\d+)(?:st|nd|rd|th)\s+season/i, (x) => `Season ${x[1]}`],
        [/final season/i, () => 'Final Season'],
        [/part\s*(\d+)/i, (x) => `Part ${x[1]}`],
        [/cour\s*(\d+)/i, (x) => `Cour ${x[1]}`],
    ];
    for (const [re, fmt] of patterns) {
        const hit = t.match(re);
        if (hit) return fmt(hit);
    }
    return null;
}

/** Most recent anime PREQUEL (by end date). */
function latestPrequel(m: AniMedia) {
    const preqs = (m.relations?.edges || [])
        .filter((e) => e.relationType === 'PREQUEL' && e.node.type === 'ANIME')
        .map((e) => e.node);
    preqs.sort((a, b) => (fuzzyToIso(b.endDate) || '').localeCompare(fuzzyToIso(a.endDate) || ''));
    return preqs[0] || null;
}

function compact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
}

async function pageAll<T>(query: string, variables: Record<string, unknown>, pick: (d: any) => { items: T[]; hasNext: boolean }, maxPages: number): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
        const data = await anilist<any>(query, { ...variables, page });
        const { items, hasNext } = pick(data);
        out.push(...items);
        if (!hasNext) break;
    }
    return out;
}

export async function runRadarWorker(): Promise<{ ok: boolean; rows: number; trending: number; requests: number; error?: string }> {
    const runStart = new Date();
    const now = Math.floor(Date.now() / 1000);
    const end = now + WINDOW_DAYS * 86400;
    let requests = 0;
    const byId = new Map<number, AniMedia & { premiereAt?: number }>();
    const add = (m: AniMedia | null | undefined, premiereAt?: number) => {
        if (!m || m.isAdult) return;
        const prev = byId.get(m.id);
        byId.set(m.id, { ...m, premiereAt: premiereAt ?? prev?.premiereAt });
    };

    try {
        // 1. Premieres: episode 1 airing inside the window.
        const premieres = await pageAll<{ airingAt: number; media: AniMedia }>(
            `query ($page: Int, $start: Int, $end: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
                airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, episode: 1, sort: TIME) { airingAt media { ${MEDIA_FIELDS} } } } }`,
            { start: now - 86400, end },
            (d) => ({ items: d.Page.airingSchedules, hasNext: d.Page.pageInfo.hasNextPage }),
            8,
        );
        requests += Math.max(1, Math.ceil(premieres.length / 50));
        for (const p of premieres) add(p.media, p.airingAt);

        // 2. Not-yet-released with a start date in the window (covers shows with no schedule yet).
        const upcoming = await pageAll<AniMedia>(
            `query ($page: Int, $from: FuzzyDateInt, $to: FuzzyDateInt) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
                media(type: ANIME, status: NOT_YET_RELEASED, startDate_greater: $from, startDate_lesser: $to, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} } } }`,
            { from: fuzzyInt(new Date(Date.now() - 86400_000)), to: fuzzyInt(new Date(end * 1000)) },
            (d) => ({ items: d.Page.media, hasNext: d.Page.pageInfo.hasNextPage }),
            4,
        );
        requests += Math.max(1, Math.ceil(upcoming.length / 50));
        for (const m of upcoming) add(m);

        // 3. Currently airing, most popular first (returning seasons already running).
        const airing = await pageAll<AniMedia>(
            `query ($page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage }
                media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} } } }`,
            {},
            (d) => ({ items: d.Page.media, hasNext: d.Page.pageInfo.hasNextPage }),
            1,
        );
        requests += 1;
        for (const m of airing) add(m);

        // Anticipation rank = popularity order among shows that have not premiered yet.
        const isUpcoming = (m: AniMedia & { premiereAt?: number }) =>
            m.status === 'NOT_YET_RELEASED' || (m.premiereAt != null && m.premiereAt > now);
        const upcomingRanked = [...byId.values()].filter(isUpcoming).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        const rankOf = new Map(upcomingRanked.map((m, i) => [m.id, i + 1]));

        const rows = [...byId.values()].map((m) => {
            const prequel = latestPrequel(m);
            const prequelEnd = fuzzyToIso(prequel?.endDate ?? null);
            const streaming = (m.externalLinks || [])
                .filter((l) => l.type === 'STREAMING')
                .map((l) => ({ name: l.site, url: l.url }))
                .filter((l, i, arr) => arr.findIndex((x) => x.name === l.name) === i);
            const nextAt = m.premiereAt && m.premiereAt > now ? m.premiereAt : m.nextAiringEpisode?.airingAt ?? null;
            const nextEp = m.premiereAt && m.premiereAt > now ? 1 : m.nextAiringEpisode?.episode ?? null;
            const rank = rankOf.get(m.id) ?? null;

            // Factual chips, most decision-relevant first.
            const chips: string[] = [];
            if (nextAt) {
                const days = Math.floor((nextAt - now) / 86400);
                const when = days <= 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
                chips.push(nextEp === 1 ? `Premieres ${when}` : `Episode ${nextEp} airs ${when}`);
            } else if (m.status === 'NOT_YET_RELEASED' && m.startDate?.year) {
                chips.push(`Starts ${fuzzyToIso(m.startDate)}`);
            }
            if (prequelEnd && nextEp === 1) {
                const endYear = Number(prequelEnd.slice(0, 4));
                const gap = runStart.getUTCFullYear() - endYear;
                const series = ['TV', 'TV_SHORT', 'ONA'];
                const isSeason = series.includes(m.format || '') && series.includes(prequel?.format || '');
                const yrs = `${gap} ${gap === 1 ? 'year' : 'years'}`;
                if (gap >= 1) chips.push(isSeason ? `First new season since ${endYear} (${yrs})` : `Prequel ended ${endYear} (${yrs} ago)`);
            }
            if (rank && rank <= 25) chips.push(`#${rank} most anticipated upcoming on AniList`);
            if (m.popularity) chips.push(`${compact(m.popularity)} members on AniList`);
            if (streaming.length) chips.push(`On ${streaming.slice(0, 3).map((s) => s.name).join(', ')}`);

            return {
                anilist_id: m.id,
                title_english: m.title.english,
                title_romaji: m.title.romaji,
                season_label: seasonLabel(m),
                format: m.format,
                episodes: m.episodes,
                next_airing_at: nextAt ? new Date(nextAt * 1000).toISOString() : null,
                next_episode: nextEp,
                start_date: fuzzyToIso(m.startDate),
                status: m.status,
                popularity: m.popularity,
                favourites: m.favourites,
                trending: m.trending,
                average_score: m.averageScore,
                studios: (m.studios?.nodes || []).map((s) => s.name),
                streaming,
                prequel_title: prequel ? (prequel.title.english || prequel.title.romaji) : null,
                prequel_end_date: prequelEnd,
                prequel_site_url: prequel?.siteUrl ?? null,
                cover_image: m.coverImage?.large ?? null,
                banner_image: m.bannerImage,
                site_url: m.siteUrl,
                genres: m.genres || [],
                anticipation_rank: rank,
                chips,
                updated_at: runStart.toISOString(),
            };
        });

        for (let i = 0; i < rows.length; i += 200) {
            const { error } = await supabaseAdmin.from('release_radar').upsert(rows.slice(i, i + 200), { onConflict: 'anilist_id' });
            if (error) throw new Error(`release_radar upsert: ${error.message}`);
        }
        // Drop shows that fell out of every window this run.
        await supabaseAdmin.from('release_radar').delete().lt('updated_at', runStart.toISOString());

        // 4. Trending top 20 into the wire (one row per show per day).
        let trendingCount = 0;
        try {
            const t = await anilist<any>(
                `query { Page(page: 1, perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { id title { english romaji } trending popularity siteUrl coverImage { large } } } }`,
                {},
            );
            requests += 1;
            const day = runStart.toISOString().slice(0, 10);
            const items: WireItemInput[] = (t.Page.media as any[]).map((m, i) => {
                const title = m.title.english || m.title.romaji;
                return {
                    fingerprint: wireFingerprint(`anilist-trending|${m.id}|${day}`),
                    kind: 'trending',
                    title: `#${i + 1} trending on AniList: ${title}`,
                    url: m.siteUrl,
                    source_name: 'AniList Trending',
                    published_at: new Date(runStart.getTime() - i * 1000).toISOString(), // keeps #1 on top
                    anime_title: title,
                    image: m.coverImage?.large ?? null,
                    summary: `Trending score ${m.trending}. ${compact(m.popularity || 0)} members on AniList.`,
                    decision: null,
                };
            });
            trendingCount = await upsertWireItems(items);
        } catch (e) {
            console.error('[Radar] trending to wire failed:', (e as Error).message);
        }

        return { ok: true, rows: rows.length, trending: trendingCount, requests };
    } catch (e) {
        return { ok: false, rows: 0, trending: 0, requests, error: (e as Error).message };
    }
}
