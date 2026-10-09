/** Server-only reads for the Discover views (Radar + Wire) and the dashboard. */
import { supabaseAdmin } from '@/lib/supabase/admin';

/** A show counts as a "big one" at or above this many AniList members. */
export const BIG_POPULARITY = 10_000;

export interface RadarRow {
    anilist_id: number;
    title_english: string | null;
    title_romaji: string | null;
    season_label: string | null;
    format: string | null;
    episodes: number | null;
    next_airing_at: string | null;
    next_episode: number | null;
    start_date: string | null;
    status: string | null;
    popularity: number | null;
    favourites: number | null;
    average_score: number | null;
    studios: string[];
    streaming: { name: string; url: string }[];
    prequel_title: string | null;
    prequel_end_date: string | null;
    prequel_site_url: string | null;
    cover_image: string | null;
    banner_image?: string | null;
    site_url: string | null;
    genres: string[];
    anticipation_rank: number | null;
    chips: string[];
    updated_at: string;
}

export interface WireRow {
    id: number;
    kind: 'news' | 'streaming' | 'release' | 'youtube' | 'trending';
    title: string;
    url: string | null;
    source_name: string | null;
    published_at: string | null;
    detected_at: string;
    anime_title: string | null;
    image: string | null;
    summary: string | null;
    decision: string | null;
    plain_title: string | null;
    is_anime: boolean | null;
    importance: number | null;
    radar_id: number | null;
    posted?: boolean;
    /** Radar art for the matched show (fallback when the item has no image). */
    radar_cover?: string | null;
    radar_banner?: string | null;
    radar_popularity?: number | null;
}

const RADAR_COLS = 'anilist_id, title_english, title_romaji, season_label, format, episodes, next_airing_at, next_episode, start_date, status, popularity, favourites, average_score, studios, streaming, prequel_title, prequel_end_date, prequel_site_url, cover_image, site_url, genres, anticipation_rank, chips, updated_at';

/** Upcoming shows (premiere in the window) + currently airing, date-sorted. */
export async function getRadarRows(): Promise<{ upcoming: RadarRow[]; airing: RadarRow[] }> {
    const { data, error } = await supabaseAdmin.from('release_radar').select(RADAR_COLS).limit(1000);
    if (error || !data) return { upcoming: [], airing: [] };
    const rows = data as unknown as RadarRow[];
    const when = (r: RadarRow) => r.next_airing_at || (r.start_date ? `${r.start_date}T12:00:00Z` : '9999');
    const byDate = (a: RadarRow, b: RadarRow) => when(a).localeCompare(when(b));
    const nowIso = new Date().toISOString();
    const isUpcoming = (r: RadarRow) =>
        r.status === 'NOT_YET_RELEASED' || (r.next_episode === 1 && !!r.next_airing_at && r.next_airing_at > nowIso);
    return {
        upcoming: rows.filter(isUpcoming).sort(byDate),
        airing: rows.filter((r) => !isUpcoming(r) && r.status === 'RELEASING' && r.next_airing_at).sort(byDate),
    };
}

export async function getNextBigPremieres(limit = 5): Promise<RadarRow[]> {
    const { upcoming } = await getRadarRows();
    return upcoming.filter((r) => (r.popularity || 0) >= BIG_POPULARITY).slice(0, limit);
}

export const WIRE_KINDS = ['news', 'streaming', 'release', 'youtube', 'trending'] as const;

const WIRE_COLS = 'id, kind, title, url, source_name, published_at, detected_at, anime_title, image, summary, decision, plain_title, is_anime, importance, radar_id';

/** Attach "posted" flags + radar art/popularity to wire rows (in place). */
async function decorateWire(rows: WireRow[]): Promise<WireRow[]> {
    const urls = rows.map((r) => r.url).filter(Boolean) as string[];
    const radarIds = [...new Set(rows.map((r) => r.radar_id).filter((x): x is number => x != null))];
    const titles = [...new Set(rows.filter((r) => r.radar_id == null && r.anime_title).map((r) => r.anime_title as string))];
    const [posts, radarById, radarByTitle] = await Promise.all([
        urls.length ? supabaseAdmin.from('posts').select('source_url').in('source_url', urls) : Promise.resolve({ data: [] as { source_url: string }[] }),
        radarIds.length ? supabaseAdmin.from('release_radar').select('anilist_id, title_english, title_romaji, cover_image, banner_image, popularity').in('anilist_id', radarIds) : Promise.resolve({ data: [] as any[] }),
        titles.length ? supabaseAdmin.from('release_radar').select('anilist_id, title_english, title_romaji, cover_image, banner_image, popularity').in('title_english', titles) : Promise.resolve({ data: [] as any[] }),
    ]);
    const posted = new Set((posts.data || []).map((p) => p.source_url));
    const byId = new Map<number, any>();
    const byTitle = new Map<string, any>();
    for (const r of [...(radarById.data || []), ...(radarByTitle.data || [])]) {
        byId.set(r.anilist_id, r);
        if (r.title_english) byTitle.set(r.title_english, r);
    }
    for (const r of rows) {
        r.posted = !!r.url && posted.has(r.url);
        const m = (r.radar_id != null ? byId.get(r.radar_id) : null) || (r.anime_title ? byTitle.get(r.anime_title) : null);
        r.radar_cover = m?.cover_image ?? null;
        r.radar_banner = m?.banner_image ?? null;
        r.radar_popularity = m?.popularity ?? null;
    }
    return rows;
}

/**
 * Wire rows, newest first. Default view hides items enrichment flagged as
 * non-anime (`all: true` shows everything). Unenriched rows always show.
 */
export async function getWireItems(opts: { kind?: string | null; offset?: number; limit?: number; all?: boolean; excludeIds?: number[] } = {}): Promise<WireRow[]> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    let q = supabaseAdmin
        .from('wire_items')
        .select(WIRE_COLS)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
    if (opts.kind && (WIRE_KINDS as readonly string[]).includes(opts.kind)) q = q.eq('kind', opts.kind);
    // "All" = headlines; the AniList trending top 20 has its own filter so it never floods the feed.
    else q = q.neq('kind', 'trending');
    if (!opts.all) q = q.or('is_anime.is.null,is_anime.eq.true');
    if (opts.excludeIds?.length) q = q.not('id', 'in', `(${opts.excludeIds.join(',')})`);
    const { data, error } = await q;
    if (error || !data) return [];
    return decorateWire(data as WireRow[]);
}

/**
 * Top stories: last 48h, anime only, ranked by importance, then the matched
 * show's AniList popularity, then recency. At most one story per show.
 */
export async function getTopStories(limit = 3): Promise<WireRow[]> {
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { data, error } = await supabaseAdmin
        .from('wire_items')
        .select(WIRE_COLS)
        .neq('kind', 'trending')
        .eq('is_anime', true)
        .not('plain_title', 'is', null)
        .or(`published_at.gte.${since},and(published_at.is.null,detected_at.gte.${since})`)
        .order('importance', { ascending: false, nullsFirst: false })
        .limit(120);
    if (error || !data) return [];
    const rows = await decorateWire(data as WireRow[]);
    const when = (r: WireRow) => Date.parse(r.published_at || r.detected_at) || 0;
    rows.sort((a, b) =>
        (b.importance ?? 0) - (a.importance ?? 0)
        || (b.radar_popularity ?? 0) - (a.radar_popularity ?? 0)
        || when(b) - when(a));
    const out: WireRow[] = [];
    const shows = new Set<string>();
    for (const r of rows) {
        const key = r.radar_id != null ? `r${r.radar_id}` : r.anime_title ? `t${r.anime_title.toLowerCase()}` : `i${r.id}`;
        if (shows.has(key)) continue;
        shows.add(key);
        out.push(r);
        if (out.length >= limit) break;
    }
    return out;
}

/**
 * Coming up: 2 big premieres + 2 big shows with an episode in the next 3 days,
 * topped up from either list, then date-sorted.
 */
export async function getComingUp(limit = 4): Promise<RadarRow[]> {
    const { data, error } = await supabaseAdmin.from('release_radar').select(`${RADAR_COLS}, banner_image`).limit(1000);
    if (error || !data) return [];
    const rows = data as unknown as RadarRow[];
    const now = Date.now();
    const when = (r: RadarRow) => Date.parse(r.next_airing_at || (r.start_date ? `${r.start_date}T12:00:00Z` : '')) || Infinity;
    const big = (r: RadarRow) => (r.popularity || 0) >= BIG_POPULARITY;
    const isPremiere = (r: RadarRow) => r.status === 'NOT_YET_RELEASED' || (r.next_episode === 1 && when(r) > now);
    const premieres = rows.filter((r) => big(r) && isPremiere(r) && when(r) > now - 86_400_000 && when(r) !== Infinity)
        .sort((a, b) => when(a) - when(b));
    const episodes = rows.filter((r) => big(r) && !isPremiere(r) && r.next_airing_at && when(r) > now && when(r) < now + 3 * 86_400_000)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    const half = Math.ceil(limit / 2);
    const pick = [...premieres.slice(0, half), ...episodes.slice(0, limit - half)];
    for (const r of [...premieres, ...episodes]) {
        if (pick.length >= limit) break;
        if (!pick.includes(r)) pick.push(r);
    }
    return pick.sort((a, b) => when(a) - when(b));
}

/** At-a-glance news volume: anime stories seen in the last 24h, and how many are big (importance 4+). */
export async function getNewsPulse(): Promise<{ total: number; big: number }> {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const base = () => supabaseAdmin.from('wire_items').select('id', { count: 'exact', head: true })
        .neq('kind', 'trending').gte('published_at', since).or('is_anime.is.null,is_anime.eq.true');
    const [all, big] = await Promise.all([base(), base().gte('importance', 4)]);
    return { total: all.count ?? 0, big: big.count ?? 0 };
}
