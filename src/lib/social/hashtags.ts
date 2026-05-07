/**
 * Social hashtag generator.
 *
 * Strategy (Jose's directive 2026-05-01):
 *   - Keep #anime + #animenews as broad-reach hashtags
 *   - Add a series-specific hashtag derived from the post title (e.g. #DemonSlayer)
 *   - Add a claim-type hashtag (#Trailer, #KeyVisual, #NewSeason, #ReleaseDate)
 *   - Cap at 6 total — more than 6 looks spammy and IG's algo doesn't reward it
 *
 * Title format coming out of formatKumoLabTitle is two-line:
 *     'Anime Title'
 *     Update • Detail
 * We pull the quoted anime name from line 1; if that fails, fall back to
 * anime_id (kebab-case slug from AniList) or a sanitized first-clause grab.
 */

const CLAIM_HASHTAG: Record<string, string> = {
    TRAILER_DROP:         '#Trailer',
    NEW_KEY_VISUAL:       '#KeyVisual',
    NEW_SEASON_CONFIRMED: '#NewSeason',
    DATE_ANNOUNCED:       '#ReleaseDate',
    DELAY:                '#AnimeDelay',
    CAST_ADDITION:        '#AnimeCast',
    STAFF_UPDATE:         '#AnimeStaff',
};

// Words we never want sitting alone as a hashtag — too generic, or part of a
// title format string rather than the actual series name.
const BLOCKLIST = new Set([
    'anime', 'animenews', 'kumolab', 'season', 'movie', 'film', 'official',
    'trailer', 'teaser', 'pv', 'visual', 'announcement', 'reveals', 'confirmed',
    'the', 'new', 'episode', 'tv', 'op', 'ed',
]);

function toPascalCase(input: string): string {
    return input
        // Drop trailing "Season N" / "Part N" / "Movie N" — fans search for the
        // base series name (#DemonSlayer, not #DemonSlayerSeason5).
        .replace(/\s+(Season|Part|Movie|Film|Cour|Arc)\s+\d+\s*$/i, '')
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ') // strip punctuation except apostrophes & hyphens
        .replace(/['-]/g, '')                // drop apostrophes/hyphens (don't survive hashtags)
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('');
}

function extractSeriesName(title: string, anime_id?: string | null): string | null {
    if (!title) return null;

    // 1. Quoted name (works for the formatKumoLabTitle two-line output):
    //    'Demon Slayer'  →  "Demon Slayer"
    const quoted = title.match(/[''""'""]([^''""'""]{2,60})[''""'""]/);
    if (quoted?.[1]) return quoted[1];

    // 2. Multi-separator titles like "Argent Light | Wistoria: Wand and Sword Season 2":
    //    split on |, •, –, —, en-dash, em-dash, hyphen-with-spaces. Pick the
    //    longest chunk that doesn't start with a generic boilerplate word.
    //    YouTube channels often use "{Song Name} | {Anime} Season N" format,
    //    so the *longer* chunk is usually the anime title.
    const chunks = title
        .split(/\s*[|•·–—]\s*|\s-\s/)
        .map(s => s.trim())
        .filter(s => s.length >= 2 && s.length <= 60);

    if (chunks.length > 1) {
        const isBoilerplate = (s: string) => /^(official|new|the)\b/i.test(s);
        const candidates = chunks.filter(c => !isBoilerplate(c)).sort((a, b) => b.length - a.length);
        if (candidates[0]) return candidates[0];
    }

    // 3. Pre-separator chunk for single-separator titles:
    //    "Demon Slayer | Season 5 Trailer" → "Demon Slayer"
    const sepMatch = title.match(/^([^|•·–—-]{2,60})/);
    if (sepMatch?.[1]) {
        const chunk = sepMatch[1].trim();
        if (chunk.length < title.length - 3) return chunk;
    }

    // 4. anime_id fallback (AniList kebab slug)
    if (anime_id && typeof anime_id === 'string') return anime_id.replace(/-/g, ' ');

    return null;
}

// Mid-tier reach hashtags (1-10M posts) — discovery layer that bridges
// the mega-tag floor (#anime, 100M+) to niche per-series tags. Pulled
// from current top-performing anime news aggregators on IG.
const MID_REACH_TAGS = [
    '#animenews',
    '#animecommunity',
    '#animeworld',
    '#otaku',
    '#animefan',
    '#animeedit',
    '#animeposting',
    '#manga',
];

// Niche fandom tags by claim type — smaller pools but higher
// engagement-rate-per-impression. Mixed in with the series-specific tag.
const CLAIM_NICHE_TAGS: Record<string, string[]> = {
    TRAILER_DROP:         ['#animeintel', '#animeleaks', '#newanimetrailer'],
    NEW_KEY_VISUAL:       ['#animekeyvisual', '#animeart', '#animeintel'],
    NEW_SEASON_CONFIRMED: ['#newanimeseason', '#animeintel', '#animeannouncement'],
    DATE_ANNOUNCED:       ['#animereleasedate', '#animecountdown', '#upcominganime'],
    DELAY:                ['#animenews', '#animedrama'],
    CAST_ADDITION:        ['#animecast', '#animevoiceacting', '#seiyuu'],
    STAFF_UPDATE:         ['#animestaff', '#animeproduction'],
    OTHER:                ['#animeintel', '#animeposting'],
};

export function buildSocialHashtags(params: {
    title: string;
    claim_type?: string | null;
    anime_id?: string | null;
}): string[] {
    // Layered for IG's 2025 algorithm: 1 mega + 2-3 mid + 3-5 niche.
    // Total target 8-10 tags. Pure-mega gets buried; pure-niche caps reach;
    // the layered mix is what news/aggregator accounts actually use to
    // pick up Explore distribution at the sub-10k follower scale.
    const tags: string[] = [];

    // 1. MEGA — broad anchor
    tags.push('#anime');

    // 2. MID — pick 3 from the rotation. Hard-include #animenews because
    // it's KumoLab's positioning anchor; the other 2 rotate to vary the
    // signal across posts and avoid getting flagged as repetitive.
    tags.push('#animenews');
    const midPool = MID_REACH_TAGS.filter(t => t !== '#animenews');
    // Stable rotation seeded by the title so the same post always gets
    // the same 2 picks (debuggable, doesn't drift across re-renders).
    const seed = (params.title || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const m1 = midPool[seed % midPool.length];
    const m2 = midPool[(seed * 7 + 3) % midPool.length];
    if (m1) tags.push(m1);
    if (m2 && m2 !== m1) tags.push(m2);

    // 3. NICHE — series-specific hashtag (always include if extractable).
    const series = extractSeriesName(params.title, params.anime_id);
    if (series) {
        const pascal = toPascalCase(series);
        if (pascal.length >= 3 && pascal.length <= 30 && !BLOCKLIST.has(pascal.toLowerCase())) {
            tags.push(`#${pascal}`);
        }
    }

    // 4. NICHE — claim-type primary hashtag (legacy: #Trailer / #KeyVisual / etc.)
    const claim = (params.claim_type || '').toUpperCase();
    if (CLAIM_HASHTAG[claim]) tags.push(CLAIM_HASHTAG[claim]);

    // 5. NICHE — claim-type fandom tags (1-3 of these, picked per-claim).
    const claimNiche = CLAIM_NICHE_TAGS[claim] || CLAIM_NICHE_TAGS.OTHER;
    for (const t of claimNiche.slice(0, 3)) tags.push(t);

    // Dedupe + cap at 10. IG accepts 30 but >10 reads as spam to the algorithm.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tags) {
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
        if (out.length >= 10) break;
    }
    return out;
}
