// anime-tiers.ts
//
// Read/write access to the `anime_tiers` table — KumoLab's engine priority
// tiers (which anime the pipeline should favor). This is the canonical source
// of truth edited via /admin/engine; the engine's posting-priority logic reads
// from here (see getAnimeTierForTitle) instead of the old hardcoded studio
// allowlist. All server-side via supabaseAdmin (RLS: service-role only).

import { supabaseAdmin } from '@/lib/supabase/admin';

export interface AnimeTier {
    id: string;
    anime: string;
    studio: string | null;
    tier: number; // 1 | 2 | 3
    anilist_id: number | null;
    popularity: number | null;
    note: string | null;
    sort_order: number;
    active: boolean;
}

const COLS = 'id, anime, studio, tier, anilist_id, popularity, note, sort_order, active';

/** All tier rows, ordered tier → studio → sort_order (for the admin view). */
export async function getAnimeTiers(): Promise<AnimeTier[]> {
    try {
        const { data, error } = await supabaseAdmin
            .from('anime_tiers')
            .select(COLS)
            .order('tier', { ascending: true })
            .order('studio', { ascending: true, nullsFirst: false })
            .order('sort_order', { ascending: true });
        if (error || !data) return [];
        return data as AnimeTier[];
    } catch {
        return [];
    }
}

/** Move an anime to an explicit tier (1-3). Used by the up/down controls. */
export async function setAnimeTier(id: string, tier: number): Promise<{ ok: boolean; reason?: string }> {
    if (![1, 2, 3].includes(tier)) return { ok: false, reason: 'tier must be 1, 2, or 3' };
    const { error } = await supabaseAdmin
        .from('anime_tiers')
        .update({ tier, updated_at: new Date().toISOString() })
        .eq('id', id);
    return error ? { ok: false, reason: error.message } : { ok: true };
}

/** Add a new anime to a tier (case-insensitive upsert on name). */
export async function addAnimeTier(input: {
    anime: string;
    studio?: string | null;
    tier: number;
    note?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
    const anime = (input.anime || '').trim();
    if (!anime) return { ok: false, reason: 'anime name required' };
    if (![1, 2, 3].includes(input.tier)) return { ok: false, reason: 'tier must be 1, 2, or 3' };
    // Reject a duplicate (case-insensitive) rather than silently no-op.
    const { data: existing } = await supabaseAdmin
        .from('anime_tiers').select('id').ilike('anime', anime).maybeSingle();
    if (existing) return { ok: false, reason: 'that anime is already in the tiers' };
    const { error } = await supabaseAdmin.from('anime_tiers').insert({
        anime,
        studio: input.studio?.trim() || null,
        tier: input.tier,
        note: input.note?.trim() || null,
        sort_order: 999, // lands at the end of its tier; reorderable later
    });
    return error ? { ok: false, reason: error.message } : { ok: true };
}

/** Remove an anime from the tiers entirely. */
export async function removeAnimeTier(id: string): Promise<{ ok: boolean; reason?: string }> {
    const { error } = await supabaseAdmin.from('anime_tiers').delete().eq('id', id);
    return error ? { ok: false, reason: error.message } : { ok: true };
}

// ── Engine-facing lookup ─────────────────────────────────────────────────────
//
// Given a post/news title, find the best-matching tier (lower number = higher
// priority). Matching is case-insensitive: an active tier entry whose `anime`
// appears in the title (or vice-versa) wins, preferring the longest match so
// "Re:Zero S4" beats a stray "Zero". Returns null when no tracked anime matches
// — the engine treats that as untiered (lowest priority / candidate to skip).
//
// Cached in-process for a minute so the hot publish path does not hit the DB per
// candidate. The admin edits are low-frequency, so a 60s staleness is fine.
let _cache: { at: number; rows: { anime: string; studio: string | null; tier: number }[] } | null = null;
const CACHE_MS = 60_000;

async function tierRows(): Promise<{ anime: string; studio: string | null; tier: number }[]> {
    const now = Date.now();
    if (_cache && now - _cache.at < CACHE_MS) return _cache.rows;
    const { data } = await supabaseAdmin
        .from('anime_tiers')
        .select('anime, studio, tier')
        .eq('active', true);
    const rows = (data as { anime: string; studio: string | null; tier: number }[]) || [];
    _cache = { at: now, rows };
    return rows;
}

export interface TierMatch {
    tier: number;
    anime: string;
    studio: string | null;
}

/**
 * Resolve the priority tier for a title (and optional studio/source). Returns
 * the matched entry or null. The engine can use `tier` to prioritize slotting
 * and `null` to down-rank or skip untracked shows once wiring lands.
 */
export async function getAnimeTierForTitle(title: string, studioHint?: string | null): Promise<TierMatch | null> {
    const t = (title || '').toLowerCase();
    if (!t) return null;
    const rows = await tierRows();
    let best: TierMatch | null = null;
    let bestLen = 0;
    for (const r of rows) {
        const name = (r.anime || '').toLowerCase().trim();
        if (name.length < 3) continue;
        // Strip a trailing "SN"/"Season N"/"Part N" so "Re:Zero S4 Part 2" still
        // matches a title that only says "Re:Zero".
        const core = name.replace(/\s+(s\d+|season\s+\d+|part\s+\d+|cour\s+\d+).*$/i, '').trim();
        const needle = core.length >= 3 ? core : name;
        if (t.includes(needle) && needle.length > bestLen) {
            best = { tier: r.tier, anime: r.anime, studio: r.studio };
            bestLen = needle.length;
        }
    }
    // Studio-level fallback: a tracked studio (e.g. our TOHO/MAPPA winners) lifts
    // an otherwise-untracked title to the best tier that studio appears in.
    if (!best && studioHint) {
        const s = studioHint.toLowerCase();
        const studioTiers = rows
            .filter((r) => r.studio && (s.includes(r.studio.toLowerCase()) || r.studio.toLowerCase().includes(s)))
            .map((r) => r.tier);
        if (studioTiers.length) {
            const tier = Math.min(...studioTiers);
            const row = rows.find((r) => r.tier === tier && r.studio && s.includes(r.studio.toLowerCase()));
            best = { tier, anime: `(studio: ${row?.studio || studioHint})`, studio: row?.studio || studioHint };
        }
    }
    return best;
}
