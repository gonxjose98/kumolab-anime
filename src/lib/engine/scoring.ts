/**
 * scoring.ts — the /100 post-scoring model (ENGINE-SCORING-MODEL.md, approved
 * by Jose 2026-07-17).
 *
 * PURE module: no DB, no network, no imports beyond types — everything here is
 * unit-testable (see __tests__/scoring.test.ts). Callers gather the inputs
 * (anime_tiers lookup, ffprobe result, claim type, timestamps) and this module
 * turns them into a total, a verdict, and the component/gate breakdown that is
 * persisted on posts.score_breakdown and rendered by the Engine tab popup.
 *
 * Components (sum to 100):
 *   Franchise / Tier  40   anime_tiers via getAnimeTierForTitle (caller)
 *   Video Quality     25   ffprobe of the fetched MP4 (provisional until probed)
 *   Category          20   claim_type
 *   Format             8   real reel vs fake-motion vs still
 *   Recency            7   detected_at — RE-SCORED as a post ages on standby
 *
 * Cutoffs: >= 75 AUTO_PUBLISH · 55-74 REVIEW · < 55 REJECT.
 * Hard gates override the total (untracked → REVIEW max; <720p or <1.2 Mbps →
 * REJECT; category OTHER → REJECT; fake motion on a tiered franchise → REVIEW;
 * trailer without an embedded video → REVIEW).
 */

// ── Public types ───────────────────────────────────────────────

export type ScoreVerdict = 'AUTO_PUBLISH' | 'REVIEW' | 'REJECT';

/** ffprobe result for a fetched MP4 (produced by trailer-fetcher's quality gate). */
export interface VideoQuality {
    height: number;        // px
    bitrate: number;       // bits/sec (overall)
    fps: number;           // frames/sec
    quality_tier: 'FULL' | 'OK' | 'REJECT';
    real_motion: boolean;  // false = slideshow / near-static source
}

export type PostFormat = 'real_video' | 'fake_motion' | 'static_image';

export interface ScorePostInput {
    /** Matched anime_tiers tier (1-3), or null when the franchise is untracked. */
    tier: 1 | 2 | 3 | null;
    /** 'anime' = matched by title; 'studio' = studio-fallback only (new original
     *  from a tracked/winner studio → 12 pts, not the full tier points). */
    tierMatchedBy?: 'anime' | 'studio' | null;
    claimType: string | null | undefined;
    format: PostFormat;
    /** When the news was detected (original_timestamp preferred). */
    detectedAt: string | Date | null | undefined;
    /** ffprobe result when available. null/undefined = probe pending (it runs
     *  at publish-time fetch); real video scores provisionally then. */
    videoQuality?: VideoQuality | null;
    /** Injectable clock for tests + standby re-scoring. */
    now?: Date;
}

export interface ScoreComponent {
    label: string;
    earned: number;
    max: number;
    reason: string;
}

export interface ScoreHardGate {
    gate: string;
    passed: boolean;
}

export interface PostScore {
    total: number;
    verdict: ScoreVerdict;
    components: ScoreComponent[];
    hard_gates: ScoreHardGate[];
    /** Extra context the popup ignores but re-scoring needs. */
    meta: {
        detected_at: string | null;
        scored_at: string;
        /** true when this post is a Facebook-only key-visual image — a separate
         *  product from the IG video reels. It bypasses the /100 reject cutoff
         *  and never joins the IG peak-slot pool/cap (set in processing-worker). */
        fb_only?: boolean;
    };
}

// ── Thresholds (single source of truth) ────────────────────────

export const SCORE_AUTO_PUBLISH_MIN = 75;
export const SCORE_REVIEW_MIN = 55;

/** Video-quality hard floor (also enforced by the trailer-fetcher gate). */
export const QUALITY_MIN_HEIGHT = 720;
export const QUALITY_MIN_BITRATE = 1_200_000;   // 1.2 Mbps
export const QUALITY_FULL_HEIGHT = 1080;
export const QUALITY_FULL_BITRATE = 2_500_000;  // 2.5 Mbps

/** Standby pool rules (Jose's selection model). */
export const STANDBY_MAX_AGE_HOURS = 48;  // fully aged (recency 0) → drops
export const STANDBY_POOL_SIZE = 3;       // next-best kept for the following day

// Gate names (stable keys — the popup + selection logic read these).
export const GATES = {
    TRACKED_FRANCHISE: 'tracked_franchise',
    MIN_VIDEO_QUALITY: 'min_video_quality',
    CATEGORY_ALLOWED: 'category_allowed',
    NO_FAKE_MOTION_ON_TIERED: 'no_fake_motion_on_tiered',
    TRAILER_HAS_VIDEO: 'trailer_has_video',
} as const;

// ── Component scorers ──────────────────────────────────────────

const CATEGORY_POINTS: Record<string, { pts: number; label: string }> = {
    TRAILER_DROP:         { pts: 20, label: 'trailer / PV' },
    NEW_SEASON_CONFIRMED: { pts: 17, label: 'season announcement' },
    DATE_ANNOUNCED:       { pts: 12, label: 'release date / premiere' },
    // DELAY is date news (a premiere moved) — scored in the release-date bucket.
    DELAY:                { pts: 12, label: 'date change (delay)' },
    NEW_KEY_VISUAL:       { pts: 6,  label: 'key visual' },
    CAST_ADDITION:        { pts: 3,  label: 'cast / staff' },
    STAFF_UPDATE:         { pts: 3,  label: 'cast / staff' },
};

function scoreRecency(detectedAt: string | Date | null | undefined, now: Date): ScoreComponent {
    const max = 7;
    const ts = detectedAt ? new Date(detectedAt).getTime() : NaN;
    if (!Number.isFinite(ts)) {
        return { label: 'Recency', earned: 0, max, reason: 'no detection timestamp' };
    }
    const hours = (now.getTime() - ts) / 3_600_000;
    if (hours <= 2) return { label: 'Recency', earned: 7, max, reason: `${hours.toFixed(1)}h old (≤2h)` };
    if (hours <= 6) return { label: 'Recency', earned: 5, max, reason: `${hours.toFixed(1)}h old (≤6h)` };
    if (hours <= 24) return { label: 'Recency', earned: 3, max, reason: `${hours.toFixed(1)}h old (≤24h)` };
    if (hours <= 48) return { label: 'Recency', earned: 1, max, reason: `${hours.toFixed(1)}h old (≤48h)` };
    return { label: 'Recency', earned: 0, max, reason: `${Math.round(hours)}h old (>48h)` };
}

/** Hours since detection, from a stored breakdown. Infinity when unknown-free. */
export function scoreAgeHours(score: Pick<PostScore, 'meta'>, now: Date = new Date()): number {
    const ts = score?.meta?.detected_at ? new Date(score.meta.detected_at).getTime() : NaN;
    if (!Number.isFinite(ts)) return 0; // unknown age — treat as fresh, never auto-drop
    return (now.getTime() - ts) / 3_600_000;
}

// ── Main entry point ───────────────────────────────────────────

export function scorePost(input: ScorePostInput): PostScore {
    const now = input.now ?? new Date();
    const claim = (input.claimType || 'OTHER').toUpperCase();
    const components: ScoreComponent[] = [];
    const gates: ScoreHardGate[] = [];

    // ── Franchise / Tier (0-40) ────────────────────────────────
    const tracked = input.tier !== null && input.tier !== undefined;
    let franchise: ScoreComponent;
    if (!tracked) {
        franchise = { label: 'Franchise / Tier', earned: 0, max: 40, reason: 'untracked franchise (not in anime_tiers)' };
    } else if (input.tierMatchedBy === 'studio') {
        franchise = { label: 'Franchise / Tier', earned: 12, max: 40, reason: `tracked-studio fallback (tier ${input.tier} studio, title not in tiers)` };
    } else {
        const pts = input.tier === 1 ? 40 : input.tier === 2 ? 30 : 20;
        franchise = { label: 'Franchise / Tier', earned: pts, max: 40, reason: `Tier ${input.tier} franchise` };
    }
    components.push(franchise);
    gates.push({ gate: GATES.TRACKED_FRANCHISE, passed: tracked });

    // ── Video Quality (0-25) ───────────────────────────────────
    // Fake motion detected by the probe (real_motion=false) demotes a "real
    // video" to the fake-motion bucket for BOTH quality and format points.
    const q = input.videoQuality ?? null;
    const probedFakeMotion = !!q && input.format === 'real_video' && !q.real_motion;
    const effectiveFormat: PostFormat = probedFakeMotion ? 'fake_motion' : input.format;

    let quality: ScoreComponent;
    let qualityFloorFailed = false;
    if (effectiveFormat === 'static_image') {
        quality = { label: 'Video Quality', earned: 0, max: 25, reason: 'static image (no video)' };
    } else if (effectiveFormat === 'fake_motion') {
        quality = {
            label: 'Video Quality', earned: 5, max: 25,
            reason: probedFakeMotion ? 'probe: near-static / slideshow source' : 'fake Ken-Burns motion on a still',
        };
    } else if (q) {
        if (q.quality_tier === 'REJECT' || q.height < QUALITY_MIN_HEIGHT || q.bitrate < QUALITY_MIN_BITRATE) {
            qualityFloorFailed = true;
            quality = {
                label: 'Video Quality', earned: 0, max: 25,
                reason: `below floor: ${q.height}p @ ${(q.bitrate / 1e6).toFixed(2)} Mbps (need ≥${QUALITY_MIN_HEIGHT}p and ≥${QUALITY_MIN_BITRATE / 1e6} Mbps)`,
            };
        } else if (q.height >= QUALITY_FULL_HEIGHT && q.bitrate >= QUALITY_FULL_BITRATE) {
            quality = { label: 'Video Quality', earned: 25, max: 25, reason: `${q.height}p @ ${(q.bitrate / 1e6).toFixed(2)} Mbps, real motion` };
        } else {
            quality = { label: 'Video Quality', earned: 15, max: 25, reason: `${q.height}p @ ${(q.bitrate / 1e6).toFixed(2)} Mbps (below the 1080p / 2.5 Mbps full bar)` };
        }
    } else {
        // Probe pending: it runs at publish-time fetch (trailer-fetcher), where
        // the hard floor is enforced for real. Score provisionally at full so a
        // clean Tier-1 trailer isn't blocked on a probe that hasn't run yet.
        quality = { label: 'Video Quality', earned: 25, max: 25, reason: 'provisional — ffprobe runs at fetch; <720p / <1.2 Mbps hard-rejected there' };
    }
    components.push(quality);
    gates.push({ gate: GATES.MIN_VIDEO_QUALITY, passed: !qualityFloorFailed });

    // ── Category (0-20) ────────────────────────────────────────
    const cat = CATEGORY_POINTS[claim];
    const categoryAllowed = !!cat;
    components.push(cat
        ? { label: 'Category', earned: cat.pts, max: 20, reason: cat.label }
        : { label: 'Category', earned: 0, max: 20, reason: `category "${claim}" is not publishable` });
    gates.push({ gate: GATES.CATEGORY_ALLOWED, passed: categoryAllowed });

    // ── Format (0-8) ───────────────────────────────────────────
    const formatPts = effectiveFormat === 'real_video' ? 8 : effectiveFormat === 'fake_motion' ? 3 : 1;
    components.push({
        label: 'Format', earned: formatPts, max: 8,
        reason: effectiveFormat === 'real_video' ? 'true video reel'
            : effectiveFormat === 'fake_motion' ? 'fake-motion reel (image-to-video)'
            : 'static image',
    });

    // Fake motion on a tiered franchise never auto-publishes.
    const fakeOnTiered = effectiveFormat === 'fake_motion' && tracked;
    gates.push({ gate: GATES.NO_FAKE_MOTION_ON_TIERED, passed: !fakeOnTiered });

    // Trailer claims must carry an embedded video (existing artifact rule).
    const trailerMissingVideo = claim === 'TRAILER_DROP' && effectiveFormat !== 'real_video';
    gates.push({ gate: GATES.TRAILER_HAS_VIDEO, passed: !trailerMissingVideo });

    // ── Recency (0-7) ──────────────────────────────────────────
    components.push(scoreRecency(input.detectedAt, now));

    // ── Total + verdict ────────────────────────────────────────
    const total = components.reduce((s, c) => s + c.earned, 0);
    const verdict = computeVerdict(total, gates);

    return {
        total,
        verdict,
        components,
        hard_gates: gates,
        meta: {
            detected_at: input.detectedAt ? new Date(input.detectedAt).toISOString() : null,
            scored_at: now.toISOString(),
        },
    };
}

// ── Verdict logic (shared by score + re-score) ─────────────────

function computeVerdict(total: number, gates: ScoreHardGate[]): ScoreVerdict {
    const failed = (gate: string) => gates.some(g => g.gate === gate && !g.passed);
    // REJECT gates override everything.
    if (failed(GATES.MIN_VIDEO_QUALITY)) return 'REJECT';
    if (failed(GATES.CATEGORY_ALLOWED)) return 'REJECT';
    if (total < SCORE_REVIEW_MIN) return 'REJECT';
    // REVIEW-max gates cap an otherwise-auto total.
    const reviewCapped =
        failed(GATES.TRACKED_FRANCHISE) ||
        failed(GATES.NO_FAKE_MOTION_ON_TIERED) ||
        failed(GATES.TRAILER_HAS_VIDEO);
    if (total >= SCORE_AUTO_PUBLISH_MIN && !reviewCapped) return 'AUTO_PUBLISH';
    return 'REVIEW';
}

// ── Standby re-scoring (recency decay) ─────────────────────────

/**
 * Re-score a STORED breakdown at a new point in time: only the Recency
 * component moves (points decay from meta.detected_at); total + verdict are
 * recomputed from the stored components/gates. Pure — used by the peak-slot
 * selection step so aging standby candidates compete at their CURRENT score.
 * Returns null when the stored shape is unusable (caller keeps the old score).
 */
export function rescoreStored(stored: unknown, now: Date = new Date()): PostScore | null {
    const s = stored as PostScore;
    if (!s || !Array.isArray(s.components) || !Array.isArray(s.hard_gates) || !s.meta) return null;
    const recency = scoreRecency(s.meta.detected_at, now);
    const components = s.components.map(c => (c.label === 'Recency' ? recency : c));
    if (!components.some(c => c.label === 'Recency')) components.push(recency);
    const total = components.reduce((sum, c) => sum + (Number(c.earned) || 0), 0);
    return {
        total,
        verdict: computeVerdict(total, s.hard_gates),
        components,
        hard_gates: s.hard_gates,
        meta: { detected_at: s.meta.detected_at ?? null, scored_at: now.toISOString() },
    };
}

/**
 * Swap the provisional Video Quality component for the MEASURED ffprobe result
 * (publish-time). Recomputes total + verdict so the persisted breakdown
 * reflects reality. Pure; returns null on an unusable stored shape.
 */
export function applyMeasuredVideoQuality(stored: unknown, q: VideoQuality, now: Date = new Date()): PostScore | null {
    const s = stored as PostScore;
    if (!s || !Array.isArray(s.components) || !Array.isArray(s.hard_gates)) return null;

    const floorFailed = q.quality_tier === 'REJECT' || q.height < QUALITY_MIN_HEIGHT || q.bitrate < QUALITY_MIN_BITRATE;
    let measured: ScoreComponent;
    if (floorFailed) {
        measured = {
            label: 'Video Quality', earned: 0, max: 25,
            reason: `measured below floor: ${q.height}p @ ${(q.bitrate / 1e6).toFixed(2)} Mbps`,
        };
    } else if (!q.real_motion) {
        measured = { label: 'Video Quality', earned: 5, max: 25, reason: 'measured: near-static / slideshow source' };
    } else if (q.height >= QUALITY_FULL_HEIGHT && q.bitrate >= QUALITY_FULL_BITRATE) {
        measured = { label: 'Video Quality', earned: 25, max: 25, reason: `measured: ${q.height}p @ ${(q.bitrate / 1e6).toFixed(2)} Mbps, real motion` };
    } else {
        measured = { label: 'Video Quality', earned: 15, max: 25, reason: `measured: ${q.height}p @ ${(q.bitrate / 1e6).toFixed(2)} Mbps` };
    }

    const components = s.components.map(c => (c.label === 'Video Quality' ? measured : c));
    const hard_gates = s.hard_gates.map(g =>
        g.gate === GATES.MIN_VIDEO_QUALITY ? { gate: g.gate, passed: !floorFailed } : g,
    );
    const total = components.reduce((sum, c) => sum + (Number(c.earned) || 0), 0);
    return {
        total,
        verdict: computeVerdict(total, hard_gates),
        components,
        hard_gates,
        meta: { detected_at: s.meta?.detected_at ?? null, scored_at: now.toISOString() },
    };
}
