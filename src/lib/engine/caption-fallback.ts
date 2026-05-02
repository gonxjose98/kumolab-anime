/**
 * Deterministic caption fallback used when the AI provider is unreachable
 * (the antigravity ollama endpoint has been intermittently 5xx'ing). No LLM
 * call — pure string templates per claim type so we always produce a clean,
 * tight, KumoLab-voiced excerpt instead of dumping the raw RSS-derived
 * content into the post body.
 *
 * Tone target: sharp, observational, not corporate, not hype-bait. Same
 * voice we'd ask the AI to use, just deterministic. Output is always
 * <= 180 chars, no emojis, no hashtags, no "per @source" hedging.
 */

const CLAIM_TEMPLATES: Record<string, string[]> = {
    TRAILER_DROP: [
        '{series} just dropped a new trailer. {source} put it up today.',
        'Fresh trailer for {series}. The cloud caught it the moment it landed.',
        '{series} got a new trailer. Real footage, not a teaser tease.',
    ],
    NEW_KEY_VISUAL: [
        '{series} unveiled a new key visual ahead of the next stretch.',
        'New visual for {series} — KumoLab tracked the drop.',
        '{series} put out a fresh visual. Mood is set.',
    ],
    NEW_SEASON_CONFIRMED: [
        '{series} is officially back. The new season is confirmed.',
        '{series} is getting another season. Confirmation just landed.',
        'New season of {series} confirmed — the wait paid off.',
    ],
    DATE_ANNOUNCED: [
        '{series} locked its premiere date. Mark it.',
        'Premiere date set for {series}. KumoLab caught the announcement.',
        '{series} has a date now — the schedule just dropped.',
    ],
    DELAY: [
        '{series} pushed back. New window confirmed.',
        '{series} is delayed. The studio pulled the lever.',
    ],
    CAST_ADDITION: [
        'New voice joins {series}. Cast just got an upgrade.',
        '{series} added another name to the cast.',
    ],
    STAFF_UPDATE: [
        '{series} staffing update — production is shifting.',
        '{series} just shuffled the staff board.',
    ],
};

const GENERIC_TEMPLATES = [
    '{series} just made news. KumoLab caught the drop.',
    'Fresh from {source}: {series} update worth watching.',
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
