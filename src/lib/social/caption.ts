/**
 * Social caption composer.
 *
 * The old caption was `title + news blurb + hashtags` — no hook, no call to
 * action, even though the posting formula calls for a fandom comment prompt.
 * This rebuilds it into the structure that reads like the big anime pages:
 *
 *     {hook}            ← scroll-stopping opener (feed preview + first read)
 *
 *     {title}           ← the formatted news headline (dates/details)
 *     {lead}            ← the one-line summary (only if it adds beyond the title)
 *
 *     {prompt}          ← a fandom comment prompt (drives comments/saves)
 *
 *     {hashtags}        ← a lean set (broad + series + niche)
 *
 * Hooks are deterministic templates keyed by claim type and injected with the
 * series name, so each post gets a content-specific, varied opener without a
 * publish-time AI call (the publish path must never block or fail on this).
 * A stable per-post hash picks the variant, so a given post always reads the
 * same but the feed as a whole never looks formulaic.
 */

import { buildSocialHashtags, extractSeriesName } from './hashtags';

// How many hashtags the caption carries — a lean 4 (broad + series + niche),
// matching what over-performs on IG better than a 6-tag wall.
const HASHTAG_CAP = 4;

/** Deterministic index into an array from a string seed (stable per post). */
function pick<T>(arr: T[], seed: string): T {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return arr[(h >>> 0) % arr.length];
}

// Series-aware hooks, keyed by claim type. `s` is the series name.
const HOOKS: Record<string, ((s: string) => string)[]> = {
    TRAILER_DROP: [
        (s) => `${s} just dropped a new trailer. 🔥`,
        (s) => `Stop scrolling. The new ${s} trailer is here. 👀`,
        (s) => `${s} is BACK, and this trailer goes hard. 🔥`,
        (s) => `New ${s} trailer just landed. 👀`,
        (s) => `The new ${s} trailer is unreal.`,
    ],
    NEW_SEASON_CONFIRMED: [
        (s) => `It's official: ${s} is getting a new season. 🎉`,
        (s) => `${s} is coming back. The wait is over. 🙌`,
        (s) => `A new season of ${s} just got confirmed. 🔥`,
        (s) => `${s} fans, we are SO back. New season incoming.`,
    ],
    DATE_ANNOUNCED: [
        (s) => `Big news for ${s} fans. 👀`,
        (s) => `New ${s} just dropped. 🔥`,
        (s) => `${s} has an update you'll want to see. 📅`,
        (s) => `${s} is back on the schedule. 🔥`,
    ],
    NEW_KEY_VISUAL: [
        (s) => `New ${s} key visual just dropped. 👀`,
        (s) => `${s} just revealed a stunning new visual. 🎨`,
    ],
    DEFAULT: [
        (s) => `Big ${s} news just dropped. 👀`,
        (s) => `${s} fans, this one's for you. 🔥`,
    ],
};

// Fallbacks when no series name can be pulled from the title.
const HOOKS_NO_SERIES: Record<string, string[]> = {
    TRAILER_DROP: ['A new trailer just dropped. 🔥', 'Stop scrolling. New trailer alert. 👀'],
    NEW_SEASON_CONFIRMED: ['A new season just got confirmed. 🎉', "It's official — new season incoming. 🙌"],
    DATE_ANNOUNCED: ['Big anime news just dropped. 👀', 'New episode alert. 🔥'],
    NEW_KEY_VISUAL: ['A stunning new key visual just dropped. 👀'],
    DEFAULT: ['Big anime news just dropped. 👀'],
};

const PROMPTS = [
    'Are you watching this one? 👇',
    "Who's hyped? Drop a 🔥",
    'Is this on your watchlist? Comment below 👇',
    'Tag someone who needs to see this 👇',
    'Sub or dub for this one? 👇',
    'What are you most excited for? 👇',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// A short, punchy series name for the HOOK: drop any subtitle after a colon and
// a trailing "Season/Part/Movie N" so the opener reads "Sakamoto Days is BACK",
// not "Sakamoto Days: Assassin's Method Season 2 is BACK". Hashtags keep their
// own (unchanged) derivation.
function hookSeriesName(series: string): string {
    const short = series
        .split(/[:：]/)[0]
        .replace(/\s+(Season|Part|Movie|Film|Cour|Arc)\s+[\w]+\s*$/i, '')
        .trim();
    return short.length >= 2 ? short : series;
}

export interface CaptionablePost {
    id?: string | null;
    slug?: string | null;
    title: string;
    excerpt?: string | null;
    content?: string | null;
    claim_type?: string | null;
    claimType?: string | null;
    anime_id?: string | number | null;
    hashtags?: string[] | null;
    /** Operator's optional per-post override — when set, published verbatim. */
    caption_override?: string | null;
}

/** Compose the full social caption: hook + headline + lead + prompt + hashtags. */
export function buildSocialCaption(post: CaptionablePost): string {
    // Optional per-post override wins — the operator hand-wrote this caption.
    const override = (post.caption_override || '').trim();
    if (override) return override.substring(0, 2200);

    const seed = String(post.id || post.slug || post.title || 'kumolab');
    const claim = String(post.claim_type || post.claimType || 'DEFAULT').toUpperCase();
    const animeId = post.anime_id != null ? String(post.anime_id) : null;
    const series = extractSeriesName(post.title, animeId);

    const hook = series
        ? pick(HOOKS[claim] || HOOKS.DEFAULT, seed)(hookSeriesName(series))
        : pick(HOOKS_NO_SERIES[claim] || HOOKS_NO_SERIES.DEFAULT, seed + 'n');

    const prompt = pick(PROMPTS, seed + 'p');
    const lead = (post.excerpt || post.content?.substring(0, 300) || '').trim();
    const title = (post.title || '').trim();
    const hashtags = buildSocialHashtags({ title: post.title, claim_type: claim, anime_id: animeId, override: post.hashtags })
        .slice(0, HASHTAG_CAP)
        .join(' ');

    const parts: string[] = [hook];
    if (title) parts.push(title);
    // Skip the lead when it's just a restatement of the headline (avoid a
    // near-duplicate paragraph).
    if (lead && norm(lead) !== norm(title)) parts.push(lead);
    parts.push(prompt);
    if (hashtags) parts.push(hashtags);

    return parts.join('\n\n').substring(0, 2200);
}
