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
    posted?: boolean;
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

export async function getWireItems(opts: { kind?: string | null; offset?: number; limit?: number } = {}): Promise<WireRow[]> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    let q = supabaseAdmin
        .from('wire_items')
        .select('id, kind, title, url, source_name, published_at, detected_at, anime_title, image, summary, decision')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
    if (opts.kind && (WIRE_KINDS as readonly string[]).includes(opts.kind)) q = q.eq('kind', opts.kind);
    // "All" = headlines; the AniList trending top 20 has its own filter so it never floods the feed.
    else q = q.neq('kind', 'trending');
    const { data, error } = await q;
    if (error || !data) return [];
    const rows = data as WireRow[];

    // Mark items that became a KumoLab post (exact source URL match).
    const urls = rows.map((r) => r.url).filter(Boolean) as string[];
    if (urls.length) {
        const { data: posts } = await supabaseAdmin.from('posts').select('source_url').in('source_url', urls);
        const posted = new Set((posts || []).map((p) => p.source_url));
        for (const r of rows) r.posted = !!r.url && posted.has(r.url);
    }
    return rows;
}
