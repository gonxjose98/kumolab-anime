/**
 * Social hashtag generator.
 *
 * Strategy (Jose's directive 2026-05-01):
 *   - Keep #anime + #animenews as broad-reach hashtags
 *   - Add a series-specific hashtag derived from the post title (e.g. #DemonSlayer)
 *   - Add a claim-type hashtag (#Trailer, #KeyVisual, #NewSeason, #ReleaseDate)
 *   - Cap at 6 total — more than 6 looks spammy and IG's algo doesn't reward it
 *
 * Title format coming out of formatKumoLabTitle is single-line:
 *     'Anime Title' Update • Detail
 * We pull the quoted anime name first; if that fails, fall back to
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

    // 1. Quoted name (works for the formatKumoLabTitle single-line output):
    //    'Demon Slayer' New Anime Official Trailer Released  →  "Demon Slayer"
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

// Per-claim "context" hashtag — the one tag that signals to IG what
// KIND of news this post represents. Curated for max-reach pools at
// KumoLab's scale: each picked from the largest existing tag in its
// category that ISN'T overrun with off-topic content.
const CLAIM_CONTEXT_TAG: Record<string, string> = {
    TRAILER_DROP:         '#newanimetrailer',
    NEW_KEY_VISUAL:       '#animekeyvisual',
    NEW_SEASON_CONFIRMED: '#newanimeseason',
    DATE_ANNOUNCED:       '#animereleasedate',
    DELAY:                '#animenews',
    CAST_ADDITION:        '#animecast',
    STAFF_UPDATE:         '#animeproduction',
    OTHER:                '#animeintel',
};

// Fan abbreviations the audience actually searches but AniList won't give
// us (it returns full + romaji titles, never "JJK"). Keyed by the
// alphanumeric-normalized series name OR anime_id slug. These ADD on top of
// the full series tag — they don't replace it (Jose's directive 2026-06-17).
// Keep this curated and small; only well-established abbreviations belong here.
const SERIES_ABBREV: Record<string, string[]> = {
    jujutsukaisen:                    ['#JJK'],
    myheroacademia:                   ['#MHA'],
    bokunoheroacademia:               ['#MHA'],
    attackontitan:                    ['#AOT'],
    shingekinokyojin:                 ['#AOT'],
    demonslayer:                      ['#KnY'],
    kimetsunoyaiba:                   ['#KnY'],
    onepunchman:                      ['#OPM'],
    jojosbizarreadventure:            ['#JJBA'],
    chainsawman:                      ['#CSM'],
    spyxfamily:                       ['#SxF'],
    fullmetalalchemist:               ['#FMA'],
    rezero:                           ['#ReZero'],
    thattimeigotreincarnatedasaslime: ['#TenSura'],
};

function normKey(s?: string | null): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function seriesAbbreviations(series?: string | null, anime_id?: string | null): string[] {
    for (const k of [normKey(series), normKey(anime_id)]) {
        if (k && SERIES_ABBREV[k]) return SERIES_ABBREV[k];
    }
    return [];
}

// Normalize an arbitrary string (auto-derived or hand-typed by the operator)
// into a clean hashtag: single leading '#', no whitespace, no fancy dashes
// (KumoLab hard rule), only letters/numbers/underscore in the body. Case is
// preserved so #JujutsuKaisen / #JJK / #anime all survive as written.
// Returns null for anything that can't become a valid tag.
export function sanitizeTag(raw: string): string | null {
    if (!raw) return null;
    const body = raw
        .trim()
        .replace(/^#+/, '')
        .replace(/[‒-―−]/g, '')      // figure/en/em/horizontal-bar/minus dashes
        .replace(/[^\p{L}\p{N}_]/gu, '');           // drop spaces + remaining punctuation
    if (body.length < 2 || body.length > 40) return null;
    return `#${body}`;
}

function dedupeCap(tags: string[], cap: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tags) {
        const k = t.toLowerCase();
        if (!t || seen.has(k)) continue;
        seen.add(k);
        out.push(t);
        if (out.length >= cap) break;
    }
    return out;
}

/**
 * The auto-derived default tag set, shown pre-filled in the admin editor and
 * used at publish time when the operator hasn't set an explicit list.
 *   1. #anime          — mega anchor, signals topic to IG's clustering
 *   2. #animenews      — KumoLab brand positioning + mid-reach pool
 *   3. #[Series]       — fandom discovery (e.g. #DemonSlayer)
 *   4. #[Abbrev]       — fan abbreviation if one exists (e.g. #JJK), ADDS
 *   5. #[Context]      — claim-type fandom (e.g. #newanimetrailer)
 * Lean 4-6: enough surface area for discovery without reading as spam.
 */
export function defaultSocialHashtags(params: {
    title: string;
    claim_type?: string | null;
    anime_id?: string | null;
}): string[] {
    const tags: string[] = ['#anime', '#animenews'];

    const series = extractSeriesName(params.title, params.anime_id);
    if (series) {
        const pascal = toPascalCase(series);
        if (pascal.length >= 3 && pascal.length <= 30 && !BLOCKLIST.has(pascal.toLowerCase())) {
            tags.push(`#${pascal}`);
        }
    }

    // Fan abbreviation(s) — add on top of the full series tag.
    for (const ab of seriesAbbreviations(series, params.anime_id)) tags.push(ab);

    // Claim-type context — prefer the targeted CONTEXT tag over the legacy
    // generic CLAIM_HASHTAG since #newanimetrailer out-reaches plain #Trailer.
    const claim = (params.claim_type || 'OTHER').toUpperCase();
    tags.push(CLAIM_CONTEXT_TAG[claim] || CLAIM_CONTEXT_TAG.OTHER);

    return dedupeCap(tags, 6);
}

/**
 * Resolve the hashtags to publish with. If the operator saved an explicit
 * list on the post (`override`), that wins — sanitized, deduped, capped at 6.
 * Otherwise fall back to the auto-derived default. Keeping both behind one
 * function means auto-pipeline posts (no operator override) and hand-approved
 * posts go through the same formatting + cap.
 */
export function buildSocialHashtags(params: {
    title: string;
    claim_type?: string | null;
    anime_id?: string | null;
    override?: string[] | null;
}): string[] {
    if (params.override && params.override.length) {
        const cleaned = params.override
            .map(sanitizeTag)
            .filter((t): t is string => !!t);
        if (cleaned.length) return dedupeCap(cleaned, 6);
    }
    return defaultSocialHashtags(params);
}
