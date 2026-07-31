/**
 * apply-tiers.mjs — insert resolved AniList rows into anime_tiers.
 *
 * Input: the JSON produced by resolve-tiers.mjs. Skips anything already in the
 * table (by lowercase name or anilist_id) so it is safe to re-run. Tier bands
 * are re-derived here rather than trusted from the input file.
 *
 *   node scripts/tiers/apply-tiers.mjs <resolved.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

// Bands are set against the actual spread of the resolved set: a 200k Tier-1
// cutoff put 87 of 127 shows in Tier 1, which makes the tier meaningless.
const tierFor = (p) => (p >= 500_000 ? 1 : p >= 200_000 ? 2 : 3);

// A bare common English word as a tier name substring-matches almost any
// headline (getAnimeTierForTitle does `title.includes(name)`), so keep them out.
const UNSAFE_NAME = /^(given|monster|free|orange|erased|bloom|carole)$/i;

const resolved = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).proposed;

const { data: existing, error: exErr } = await db
    .from('anime_tiers').select('anime, anilist_id');
if (exErr) { console.error('read failed:', exErr.message); process.exit(1); }
const haveName = new Set(existing.map((r) => (r.anime || '').toLowerCase()));
const haveId = new Set(existing.map((r) => r.anilist_id).filter(Boolean));

const rows = [];
const skipped = [];
for (const r of resolved) {
    if (!r.anime) continue;
    if (UNSAFE_NAME.test(r.anime.trim())) { skipped.push(`${r.anime} (unsafe name)`); continue; }
    if (haveName.has(r.anime.toLowerCase())) { skipped.push(`${r.anime} (name exists)`); continue; }
    if (haveId.has(r.anilist_id)) { skipped.push(`${r.anime} (anilist_id exists)`); continue; }
    haveName.add(r.anime.toLowerCase());
    haveId.add(r.anilist_id);
    rows.push({
        anime: r.anime,
        studio: r.studio,
        tier: tierFor(r.popularity),
        anilist_id: r.anilist_id,
        popularity: r.popularity,
        note: 'auto: AniList refresh 2026-07-31',
        sort_order: 500,
    });
}

console.log(`inserting ${rows.length}, skipping ${skipped.length}`);
if (rows.length) {
    const { error } = await db.from('anime_tiers').insert(rows);
    if (error) { console.error('insert failed:', error.message); process.exit(1); }
}
console.log('skipped:', skipped.join(' | ') || '(none)');
const counts = rows.reduce((a, r) => ((a[r.tier] = (a[r.tier] || 0) + 1), a), {});
console.log('by tier:', counts);
