/**
 * Deterministic caption fallback used when the entire AI provider chain is
 * unreachable. No LLM call — pure string templates per claim type so we
 * always produce a clean, tight, KumoLab-voiced caption instead of dumping
 * the raw RSS-derived content into the post body.
 *
 * Tone target: sharp, observational, editorial. Two-paragraph shape matches
 * the AI prompt: short hook, then the announcement line wrapping the series
 * name in single quotes. No "officially," no hashtags, no emojis, no
 * "fans are excited" / "according to" filler.
 */

const CLAIM_TEMPLATES: Record<string, string[]> = {
    TRAILER_DROP: [
        "A fresh trailer just landed.\n\n'{series}' has a new look at what's coming.",
        "New trailer dropped today.\n\n'{series}' shows another piece of the picture.",
    ],
    NEW_KEY_VISUAL: [
        "A new visual just surfaced.\n\n'{series}' updates the look ahead of the next chapter.",
        "Key art just landed.\n\n'{series}' tightens the mood for what's coming.",
    ],
    NEW_SEASON_CONFIRMED: [
        "Another chapter is on the way.\n\n'{series}' is coming back for a new season.",
        "The next season is locked in.\n\n'{series}' returns with more story to tell.",
    ],
    DATE_ANNOUNCED: [
        "The premiere window is set.\n\n'{series}' has a date.",
        "Schedule just landed.\n\n'{series}' premieres soon.",
    ],
    DELAY: [
        "The release just shifted.\n\n'{series}' moves to a new window.",
        "A new timeline is in.\n\n'{series}' has been pushed back.",
    ],
    CAST_ADDITION: [
        "The cast list just got bigger.\n\n'{series}' added a new voice.",
        "A new name joins the booth.\n\n'{series}' brings on more cast.",
    ],
    STAFF_UPDATE: [
        "Production is shifting.\n\n'{series}' updated its staff.",
        "A new name is on the production board.\n\n'{series}' shuffles the staff.",
    ],
};

const GENERIC_TEMPLATES = [
    "An update worth watching.\n\n'{series}' just made news.",
    "The latest from the scene.\n\n'{series}' has a fresh update.",
];

function pickStable(templates: string[], seed: string): string {
    if (templates.length === 0) return '';
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return templates[Math.abs(h) % templates.length];
}

function extractSeriesName(title: string): string | null {
    if (!title) return null;
    const quoted = title.match(/[''""'""]([^''""'""]{2,60})[''""'""]/);
    if (quoted?.[1]) return quoted[1].trim();
    const beforeSep = title.split(/\s*[|•·–—]\s*/)[0]?.trim();
    if (beforeSep && beforeSep.length >= 2 && beforeSep.length <= 60) return beforeSep;
    return null;
}

function cleanSourceLabel(source: string | null | undefined): string {
    if (!source) return 'the source';
    if (source.startsWith('YouTube_')) return source.replace(/^YouTube_/, '');
    return source;
}

/**
 * Returns a deterministic caption suitable for `posts.excerpt`. Caller falls
 * through here when AI generation throws or returns empty.
 */
export function buildFallbackCaption(params: {
    title: string;
    claim_type?: string | null;
    source?: string | null;
}): string {
    const claim = (params.claim_type || 'OTHER').toUpperCase();
    const series = extractSeriesName(params.title) || 'the series';
    const source = cleanSourceLabel(params.source);

    const templates = CLAIM_TEMPLATES[claim] || GENERIC_TEMPLATES;
    const tpl = pickStable(templates, params.title || claim);

    const out = tpl
        .replace(/\{series\}/g, series)
        .replace(/\{source\}/g, source)
        .replace(/\s{2,}/g, ' ')
        .trim();

    return out.length > 200 ? out.substring(0, 197).trim() + '…' : out;
}
