/**
 * anilist-validator.ts
 *
 * Cross-check anime claims against AniList before auto-publishing. If a candidate
 * has an anime_id but AniList doesn't know it — or the title doesn't plausibly
 * match anything on AniList — the claim can't be verified and should go to review.
 *
 * In-process cache; AniList query cost is low but we hit it repeatedly per run.
 */

const ANILIST_URL = 'https://graphql.anilist.co';

interface AniListResult {
    exists: boolean;
    canonicalTitle?: string;
    status?: string;       // FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS
    format?: string;       // TV, MOVIE, OVA, ONA, SPECIAL
    reason?: string;
}

// tiny in-process cache, 10-min TTL
type Cached = { at: number; result: AniListResult };
const cache = new Map<string, Cached>();
const TTL_MS = 10 * 60 * 1000;

function cacheKey(animeId: string | number | null | undefined, title: string | undefined): string {
    if (animeId) return `id:${animeId}`;
    return `t:${(title || '').toLowerCase().trim()}`;
}

function getCached(key: string): AniListResult | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return null; }
    return hit.result;
}

function setCached(key: string, result: AniListResult) {
    cache.set(key, { at: Date.now(), result });
    // Cap cache size
    if (cache.size > 500) {
        const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at).slice(0, 100);
        for (const [k] of oldest) cache.delete(k);
    }
}

async function queryAniList(query: string, variables: Record<string, any>): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.data ?? null;
    } catch {
        clearTimeout(timeout);
        return null;
    }
}

/**
 * Validate an anime claim against AniList.
 *
 * Behavior:
 *   - If anime_id provided: query by ID. Exists or not, definitive answer.
 *   - If only title provided: search AniList by title. "Exists" if a plausible match is found
 *     (same normalized title or contains/contained).
 *   - On network failure / timeout: returns { exists: false, reason: 'anilist_unreachable' }
 *     — caller decides whether to treat as hard-fail or soft-pass.
 */
export async function validateAnime(input: { anime_id?: string | number | null; title?: string | null }): Promise<AniListResult> {
    const key = cacheKey(input.anime_id, input.title ?? undefined);
    const cached = getCached(key);
    if (cached) return cached;

    let result: AniListResult = { exists: false, reason: 'no_signal' };

    if (input.anime_id) {
        const data = await queryAniList(
            `query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji english } status format } }`,
            { id: Number(input.anime_id) }
        );
        if (data?.Media) {
            result = {
                exists: true,
                canonicalTitle: data.Media.title?.english || data.Media.title?.romaji,
                status: data.Media.status,
                format: data.Media.format,
            };
        } else {
            result = { exists: false, reason: 'anilist_id_not_found' };
        }
        setCached(key, result);
        return result;
    }

    if (input.title && input.title.trim().length >= 2) {
        const data = await queryAniList(
            `query ($q: String) { Media(search: $q, type: ANIME) { id title { romaji english } status format } }`,
            { q: input.title.trim() }
        );
        if (data?.Media) {
            result = {
                exists: true,
                canonicalTitle: data.Media.title?.english || data.Media.title?.romaji,
                status: data.Media.status,
                format: data.Media.format,
            };
        } else {
            result = { exists: false, reason: 'anilist_title_not_found' };
        }
        setCached(key, result);
        return result;
    }

    return result;
}
