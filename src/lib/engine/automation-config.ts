/**
 * automation-config.ts
 *
 * Single source of truth for the v2 automation pipeline:
 *   - claim-type risk matrix (which auto, which need corroboration, which always review)
 *   - platform caps + peak-hour windows for the scheduler
 *   - corroboration window, circuit-breaker thresholds, text-post daily cap
 *
 * Change knobs here; decision engine and scheduler both read from this file.
 */

// ── Automation tunables (env-overrideable) ─────────────────────
const n = (v: string | undefined, d: number) => {
    const parsed = parseInt(v || '', 10);
    return Number.isFinite(parsed) ? parsed : d;
};

export const AUTOMATION = {
    // Corroboration: non-video T1/T2 claims need ≥N distinct sources within window
    CORROBORATION_WINDOW_HOURS: n(process.env.KUMOLAB_CORROBORATION_HOURS, 12),
    CORROBORATION_MIN_SOURCES: n(process.env.KUMOLAB_CORROBORATION_MIN_SOURCES, 2),

    // Circuit breaker: corrections in 24h before auto-publish pauses
    CIRCUIT_BREAKER_THRESHOLD: n(process.env.KUMOLAB_CIRCUIT_BREAKER_THRESHOLD, 3),
    CIRCUIT_BREAKER_WINDOW_HOURS: 24,

    // Soft daily cap for non-video (text) posts across all claim types
    TEXT_POST_DAILY_CAP: n(process.env.KUMOLAB_TEXT_POST_DAILY_CAP, 12),

    // AniList validation: if a candidate has an anime_id, we require it to resolve.
    // If anime_id is missing, we fall back to "no validation" (can't query AniList by free text reliably).
    REQUIRE_ANILIST_VALIDATION_WHEN_AVAILABLE: true,
};

// ── Claim-type risk matrix ─────────────────────────────────────
// AUTO       — eligible for auto-publish when source + score + image conditions pass
// CORROBORATE — requires ≥N independent T1/T2 sources within window, otherwise queue
// REVIEW     — always queued for human review (brand-sensitive claims)
// REJECT     — never published
export type ClaimRisk = 'AUTO' | 'CORROBORATE' | 'REVIEW' | 'REJECT';

// Content-mix priorities (Jose, 2026-05-01): KumoLab is more than a trailer
// reposter. Season confirmations, key visuals, and release dates with strong
// images are the brand's lead content. Trailers stay AUTO but no longer
// dominate by default — these other claim types now AUTO at T1 (and T2 for
// dates) so they actually flow through instead of waiting on corroboration.
export const CLAIM_RISK_BY_TIER: Record<string, { t1: ClaimRisk; t2: ClaimRisk; t3: ClaimRisk }> = {
    TRAILER_DROP:          { t1: 'AUTO',        t2: 'AUTO',        t3: 'REVIEW' },
    NEW_KEY_VISUAL:        { t1: 'AUTO',        t2: 'AUTO',        t3: 'REVIEW' },
    DATE_ANNOUNCED:        { t1: 'AUTO',        t2: 'AUTO',        t3: 'REVIEW' },
    NEW_SEASON_CONFIRMED:  { t1: 'AUTO',        t2: 'CORROBORATE', t3: 'REVIEW' },
    DELAY:                 { t1: 'CORROBORATE', t2: 'CORROBORATE', t3: 'REVIEW' },
    STAFF_UPDATE:          { t1: 'CORROBORATE', t2: 'REVIEW',      t3: 'REVIEW' },
    CAST_ADDITION:         { t1: 'CORROBORATE', t2: 'REVIEW',      t3: 'REVIEW' },
    OTHER:                 { t1: 'REJECT',      t2: 'REJECT',      t3: 'REJECT' },
    OTHER_ABORT:           { t1: 'REJECT',      t2: 'REJECT',      t3: 'REJECT' },
};

export function claimRisk(claim_type: string | undefined, source_tier: number | undefined): ClaimRisk {
    const key = (claim_type || 'OTHER').toUpperCase();
    const row = CLAIM_RISK_BY_TIER[key] || CLAIM_RISK_BY_TIER.OTHER;
    const tier = source_tier === 1 ? 't1' : source_tier === 2 ? 't2' : 't3';
    return row[tier];
}

// ── Scheduler config ───────────────────────────────────────────
// Meta Suite cross-posts IG → Facebook + Threads automatically on Jose's side,
// so 'instagram' below represents the whole Meta surface. Don't publish to FB or
// Threads directly — that would duplicate the IG cross-post.
export type Platform = 'website' | 'x' | 'instagram' | 'tiktok' | 'youtube_shorts';

export type Lane = 'BREAKING' | 'STANDARD' | 'FILL';

// Instagram (the whole Meta surface — one pipe) is capped at EXACTLY 3/day
// per Jose's selection model (2026-07-17, ENGINE-SCORING-MODEL.md): one post
// per peak slot, standby pool backfills, highest CURRENT score wins. The
// scheduler's runSlotSelection() enforces this cap when filling slots.
export const PLATFORM_DAILY_CAP: Record<Platform, number> = {
    website:        Infinity,
    x:              Infinity,
    instagram:      3,
    tiktok:         Infinity,
    youtube_shorts: Infinity,
};

// Active posting windows per platform, expressed in ET hours (0-23). Scheduler avoids off-hours.
export const PLATFORM_PEAK_WINDOWS: Record<Platform, Array<[number, number]>> = {
    website:        [[0, 24]],
    x:              [[6, 23]],
    instagram:      [[7, 23]],
    tiktok:         [[18, 23], [6, 9]],
    youtube_shorts: [[10, 22]],
};

// Breaking lane: if detected_at < N minutes ago and claim_type is time-sensitive, go immediate.
export const BREAKING_MAX_AGE_MINUTES = 120;
export const BREAKING_CLAIM_TYPES = new Set([
    'TRAILER_DROP',
    'DATE_ANNOUNCED',
    'NEW_KEY_VISUAL',
    'NEW_SEASON_CONFIRMED',
]);

// Diversity guards — prevent feed looking like an ad for one source/anime.
export const DIVERSITY = {
    MAX_CONSECUTIVE_SAME_SOURCE: 2,
    MAX_CONSECUTIVE_SAME_ANIME: 3,
    // Minimum minutes between consecutive posts on the same platform (STANDARD lane).
    MIN_GAP_MINUTES: 25,
};

// ── Trailer source allowlist ───────────────────────────────────
// A TRAILER_DROP post must embed an actual video, and our static-fetch
// extractor can only see embeds in two cases:
//   1. The candidate's source URL IS the YouTube URL (YouTube channel RSS).
//   2. The article HTML embeds raw <iframe> / oEmbed-style YouTube tags
//      (ANN does this; Crunchyroll News renders embeds via JavaScript so
//      a static fetch never sees them).
// Anywhere else, treating "Trailer" in the headline as TRAILER_DROP just
// produces broken posts that fall through to manual review. We classify
// those as the next-best claim instead (season / key visual / etc.).
export const TRAILER_TRUSTED_SOURCES = new Set<string>([
    'AnimeNewsNetwork',
]);

export function isTrailerTrustedSource(sourceName: string | undefined | null): boolean {
    if (!sourceName) return false;
    if (sourceName.startsWith('YouTube_')) return true;
    return TRAILER_TRUSTED_SOURCES.has(sourceName);
}

// ── Premium-slot studios (publish priority) ────────────────────
// CHANGE FOLLOWING IG ANALYSIS RUN 3 (2026-06-06). See REVIEW-CHANGELOG.md.
//
// Every breakout Reel KumoLab has ever produced is a TOHO Animation
// trailer (Snowball Earth 194k, Dorohedoro S2 88.7k, MHA No.170+1 60k).
// Other tier-1 studio channels (Crunchyroll, Viz, Kadokawa, Aniplex)
// topped out in the low thousands over the same window — `source_tier`
// (all == 1) can't separate them, so we wire publish priority by studio
// name instead. Posts from a priority studio claim the premium peak-hour
// slots; everything else fills the off-peak pool first, reserving the
// high-first-hour-engagement windows for our highest-ceiling content.
//
// This is a hypothesis under test (Run 3 H13), not a permanent truth.
// Re-evaluate the list every account-review cycle: promote a studio when
// the data shows it producing breakouts, demote one that stops. Match is
// a case-insensitive substring test against the post's source name (which
// carries a "YouTube_" prefix for channel sources, e.g. "YouTube_TOHO
// Animation").
export const PREMIUM_PUBLISH_STUDIOS: string[] = [
    'TOHO Animation',
];

export function isPremiumStudio(sourceName: string | undefined | null): boolean {
    if (!sourceName) return false;
    const s = sourceName.toLowerCase();
    return PREMIUM_PUBLISH_STUDIOS.some(name => s.includes(name.toLowerCase()));
}
