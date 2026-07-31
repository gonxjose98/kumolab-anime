/**
 * tier-refresh.ts
 *
 * Keeps `anime_tiers` current on its own.
 *
 * WHY THIS EXISTS: the tier list is hand-curated and nothing refreshed it. The
 * list built 2026-07-17 held 24 currently-airing shows; by 2026-07-30 the news
 * cycle had moved past them, every new post scored 0/40 on Franchise, and
 * auto-publishing silently fell to zero. No error was logged, because "no tier
 * match" is a legitimate answer rather than a fault. See
 * [KumoLab's silent-decay failure mode] — the fix for that class of bug is not
 * a better alert, it is removing the manual step that rots.
 *
 * What a run does:
 *   1. Reads the series names actually appearing in the last 30 days of posts.
 *   2. Drops the ones already covered by a tier entry.
 *   3. Asks AniList for id / canonical title / popularity / studio.
 *   4. Inserts anything big enough to be worth a slot, tiered by popularity.
 *   5. Re-reads popularity for rows it previously added and re-tiers them, so
 *      a franchise that grows or fades moves without anyone noticing.
 *
 * Rows Jose added by hand are NEVER modified or deleted — this only touches
 * rows carrying the AUTO_NOTE marker. His curation outranks a crowd metric.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { animeSearchCandidates } from './anilist-validator';

const ANILIST_URL = 'https://graphql.anilist.co';

/** Marker on rows this job owns. Anything without it is treated as manual. */
export const AUTO_NOTE = 'auto: AniList refresh';

/**
 * Tier bands. Set against the real spread of a resolved set rather than picked
 * round numbers: at a 200k Tier-1 cutoff, 87 of 127 resolved shows landed in
 * Tier 1, which makes the top tier carry no information.
 */
export function tierForPopularity(pop: number): 1 | 2 | 3 | null {
    if (pop >= 500_000) return 1;
    if (pop >= 200_000) return 2;
    if (pop >= 25_000) return 3;
    return null; // too small to earn a slot; the AniList fallback still scores it
}

/** A bare common word substring-matches nearly any headline. */
const UNSAFE_NAME = /^(given|monster|free|orange|erased|bloom|carole|pluto|beck|air|clover)$/i;

/** One-off mentions are noise; a real franchise recurs in the feed. */
const MIN_MENTIONS = 2;
/** Cap AniList calls per run so a busy news week can't stall the request. */
const MAX_LOOKUPS = 40;
/** Re-check an auto row's popularity at most this often. */
const REFRESH_AFTER_DAYS = 30;

export interface TierRefreshResult {
    ok: boolean;
    added: { anime: string; tier: number; popularity: number }[];
    retiered: { anime: string; from: number; to: number; popularity: number }[];
    considered: number;
    lookups: number;
    reason?: string;
}

interface AniListHit {
    id: number;
    title: string;
    popularity: number;
    studio: string | null;
}

const LOOKUP_QUERY = `query ($q: String) {
  Media(search: $q, type: ANIME, sort: [POPULARITY_DESC]) {
    id
    title { romaji english }
    popularity
    studios(isMain: true) { nodes { name } }
  }
}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lookup(q: string): Promise<AniListHit | null> {
    try {
        const res = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: LOOKUP_QUERY, variables: { q } }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const j = await res.json();
        const m = j?.data?.Media;
        if (!m || typeof m.popularity !== 'number') return null;
        return {
            id: m.id,
            title: m.title?.english || m.title?.romaji,
            popularity: m.popularity,
            studio: m.studios?.nodes?.[0]?.name ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * Strip the season/part suffix the same way getAnimeTierForTitle does, so
 * "already covered?" here means the same thing it means at scoring time.
 */
function needleFor(anime: string): string {
    const name = (anime || '').toLowerCase().trim();
    const core = name.replace(/\s+(s\d+|season\s+\d+|part\s+\d+|cour\s+\d+).*$/i, '').trim();
    return core.length >= 3 ? core : name;
}

export async function refreshAnimeTiers(): Promise<TierRefreshResult> {
    const added: TierRefreshResult['added'] = [];
    const retiered: TierRefreshResult['retiered'] = [];
    let lookups = 0;

    try {
        const { data: tiers, error: tierErr } = await supabaseAdmin
            .from('anime_tiers')
            .select('id, anime, tier, anilist_id, popularity, note, updated_at');
        if (tierErr) return { ok: false, added, retiered, considered: 0, lookups, reason: tierErr.message };

        const rows = tiers || [];
        const haveName = new Set(rows.map((r) => (r.anime || '').toLowerCase()));
        const haveId = new Set(rows.map((r) => r.anilist_id).filter(Boolean) as number[]);
        const needles = rows.map((r) => needleFor(r.anime)).filter((n) => n.length >= 3);

        // ── 1. What has the feed actually been talking about? ────────────────
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: posts, error: postErr } = await supabaseAdmin
            .from('posts')
            .select('title')
            .gte('created_at', since)
            .limit(1000);
        if (postErr) return { ok: false, added, retiered, considered: 0, lookups, reason: postErr.message };

        const mentions = new Map<string, number>();
        for (const p of posts || []) {
            const title = (p.title || '') as string;
            if (!title) continue;
            const lower = title.toLowerCase();
            // Already covered by an existing tier entry → nothing to learn here.
            if (needles.some((n) => lower.includes(n))) continue;
            // The formatter wraps the series name in quotes; take the best guess.
            const name = animeSearchCandidates(title)[0];
            if (!name || name.length < 3) continue;
            const key = name.toLowerCase();
            mentions.set(key, (mentions.get(key) || 0) + 1);
        }

        const candidates = Array.from(mentions.entries())
            .filter(([, n]) => n >= MIN_MENTIONS)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_LOOKUPS);

        // ── 2. Resolve and insert the ones big enough to matter ──────────────
        for (const [name] of candidates) {
            const hit = await lookup(name);
            lookups++;
            await sleep(700); // AniList allows 90/min
            if (!hit || !hit.title) continue;
            if (UNSAFE_NAME.test(hit.title.trim())) continue;
            if (haveName.has(hit.title.toLowerCase()) || haveId.has(hit.id)) continue;
            const tier = tierForPopularity(hit.popularity);
            if (!tier) continue;

            const { error } = await supabaseAdmin.from('anime_tiers').insert({
                anime: hit.title,
                studio: hit.studio,
                tier,
                anilist_id: hit.id,
                popularity: hit.popularity,
                note: `${AUTO_NOTE} ${new Date().toISOString().slice(0, 10)}`,
                sort_order: 500,
            });
            if (error) continue;
            haveName.add(hit.title.toLowerCase());
            haveId.add(hit.id);
            added.push({ anime: hit.title, tier, popularity: hit.popularity });
        }

        // ── 3. Re-tier auto rows whose popularity has moved ──────────────────
        const staleBefore = Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
        const refreshable = rows
            .filter((r) => (r.note || '').startsWith(AUTO_NOTE) && r.anilist_id)
            .filter((r) => new Date(r.updated_at as string).getTime() < staleBefore)
            .slice(0, Math.max(0, MAX_LOOKUPS - lookups));

        for (const row of refreshable) {
            const hit = await lookup(row.anime);
            lookups++;
            await sleep(700);
            if (!hit || hit.id !== row.anilist_id) continue;
            const tier = tierForPopularity(hit.popularity);
            if (!tier) continue;
            const { error } = await supabaseAdmin
                .from('anime_tiers')
                .update({ popularity: hit.popularity, tier, updated_at: new Date().toISOString() })
                .eq('id', row.id);
            if (error) continue;
            if (tier !== row.tier) {
                retiered.push({ anime: row.anime, from: row.tier as number, to: tier, popularity: hit.popularity });
            }
        }

        return { ok: true, added, retiered, considered: candidates.length, lookups };
    } catch (e: any) {
        // Fail loudly. A refresh that quietly does nothing is the exact failure
        // this module exists to prevent.
        try {
            await supabaseAdmin.from('error_logs').insert({
                source: 'tier-refresh',
                error_message: e?.message || 'tier refresh exception',
                context: { added: added.length, retiered: retiered.length, lookups },
            });
        } catch { /* logging must never mask the original failure */ }
        return { ok: false, added, retiered, considered: 0, lookups, reason: e?.message || 'exception' };
    }
}
