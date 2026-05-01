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

export function buildSocialHashtags(params: {
    title: string;
    claim_type?: string | null;
    anime_id?: string | null;
}): string[] {
    const tags: string[] = ['#anime'];

    const series = extractSeriesName(params.title, params.anime_id);
    if (series) {
        const pascal = toPascalCase(series);
        // Reasonable length window for a single-series hashtag. >30 chars
        // looks like a sentence got mashed in; <3 chars is a noise word.
        if (pascal.length >= 3 && pascal.length <= 30 && !BLOCKLIST.has(pascal.toLowerCase())) {
            tags.push(`#${pascal}`);
        }
    }

    const claim = (params.claim_type || '').toUpperCase();
    if (CLAIM_HASHTAG[claim]) tags.push(CLAIM_HASHTAG[claim]);

    tags.push('#animenews');

    // Dedupe + cap at 6
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tags) {
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
        if (out.length >= 6) break;
    }
    return out;
}
