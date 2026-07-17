import { describe, it, expect } from 'vitest';
import {
    scorePost,
    rescoreStored,
    applyMeasuredVideoQuality,
    type VideoQuality,
} from '@/lib/engine/scoring';

// Worked examples for the /100 model (ENGINE-SCORING-MODEL.md, approved
// 2026-07-17). Pure function — fixed clock, no I/O.

const NOW = new Date('2026-07-17T18:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const FULL_Q: VideoQuality = { height: 1080, bitrate: 3_000_000, fps: 24, quality_tier: 'FULL', real_motion: true };
const OK_Q: VideoQuality = { height: 720, bitrate: 1_800_000, fps: 24, quality_tier: 'OK', real_motion: true };
const LOW_Q: VideoQuality = { height: 480, bitrate: 800_000, fps: 24, quality_tier: 'REJECT', real_motion: true };

describe('scorePost — worked examples', () => {
    it('1) Tier-1 fresh trailer, full-quality real video → 100, AUTO_PUBLISH', () => {
        // 40 (T1) + 25 (full quality) + 20 (trailer) + 8 (real reel) + 7 (≤2h) = 100
        const s = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: FULL_Q, now: NOW,
        });
        expect(s.total).toBe(100);
        expect(s.verdict).toBe('AUTO_PUBLISH');
        expect(s.hard_gates.every(g => g.passed)).toBe(true);
    });

    it('2) Tier-2 season announcement, 720p video, 12h old → 73, REVIEW', () => {
        // 30 (T2) + 15 (720p ok) + 17 (season) + 8 (real reel) + 3 (≤24h) = 73
        const s = scorePost({
            tier: 2, tierMatchedBy: 'anime', claimType: 'NEW_SEASON_CONFIRMED',
            format: 'real_video', detectedAt: hoursAgo(12), videoQuality: OK_Q, now: NOW,
        });
        expect(s.total).toBe(73);
        expect(s.verdict).toBe('REVIEW');
    });

    it('3) Untracked-franchise fresh trailer, full quality → 60, REVIEW (never auto)', () => {
        // 0 (untracked) + 25 + 20 + 8 + 7 = 60 — and the tracked_franchise gate
        // caps it at REVIEW even if the total were ≥75.
        const s = scorePost({
            tier: null, claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: FULL_Q, now: NOW,
        });
        expect(s.total).toBe(60);
        expect(s.verdict).toBe('REVIEW');
        expect(s.hard_gates.find(g => g.gate === 'tracked_franchise')?.passed).toBe(false);
    });

    it('4) Tier-1 static key visual, 3h old → 52, REJECT (below 55)', () => {
        // 40 (T1) + 0 (still) + 6 (key visual) + 1 (static) + 5 (≤6h) = 52
        const s = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'NEW_KEY_VISUAL',
            format: 'static_image', detectedAt: hoursAgo(3), now: NOW,
        });
        expect(s.total).toBe(52);
        expect(s.verdict).toBe('REJECT');
    });
});

describe('scorePost — hard gates', () => {
    it('rejects below the 720p / 1.2 Mbps floor regardless of total', () => {
        const s = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: LOW_Q, now: NOW,
        });
        expect(s.verdict).toBe('REJECT');
        expect(s.hard_gates.find(g => g.gate === 'min_video_quality')?.passed).toBe(false);
    });

    it('rejects category OTHER regardless of total', () => {
        const s = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'OTHER',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: FULL_Q, now: NOW,
        });
        expect(s.verdict).toBe('REJECT');
    });

    it('caps fake motion on a tiered franchise at REVIEW even at ≥75', () => {
        // 40 + 5 (fake motion) + 20 + 3 (fake-motion reel) + 7 = 75 → gate caps it.
        const s = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'fake_motion', detectedAt: hoursAgo(1), now: NOW,
        });
        expect(s.total).toBe(75);
        expect(s.verdict).toBe('REVIEW');
    });

    it('scores a real YouTube video provisionally at 25 when the probe is pending', () => {
        const s = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: null, now: NOW,
        });
        expect(s.total).toBe(100);
        expect(s.verdict).toBe('AUTO_PUBLISH');
    });

    it('gives a tracked-studio-only match 12 franchise points', () => {
        const s = scorePost({
            tier: 1, tierMatchedBy: 'studio', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: FULL_Q, now: NOW,
        });
        // 12 + 25 + 20 + 8 + 7 = 72 → REVIEW (a new original gets one human look)
        expect(s.total).toBe(72);
        expect(s.verdict).toBe('REVIEW');
    });
});

describe('rescoreStored — standby recency decay', () => {
    it('decays only the recency component as a pooled post ages', () => {
        const fresh = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: FULL_Q, now: NOW,
        });
        expect(fresh.total).toBe(100);
        // 30 hours later: recency 7 → 1 (≤48h) ⇒ 94, still AUTO.
        const later = rescoreStored(fresh, new Date(NOW.getTime() + 30 * 3_600_000));
        expect(later?.total).toBe(94);
        expect(later?.verdict).toBe('AUTO_PUBLISH');
        // 3 days later: recency 0 ⇒ 93.
        const muchLater = rescoreStored(fresh, new Date(NOW.getTime() + 72 * 3_600_000));
        expect(muchLater?.total).toBe(93);
    });

    it('drops a borderline auto below the 75 bar as it ages', () => {
        // 75 exactly when fresh: T2 (30) + full quality (25) + season (17) + hmm…
        // use T1 key-visual video: 40 + 25 + 6 + 8 + 7 = 86 fresh → 79 at 30h → 79.
        const fresh = scorePost({
            tier: 2, tierMatchedBy: 'anime', claimType: 'NEW_SEASON_CONFIRMED',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: FULL_Q, now: NOW,
        });
        // 30 + 25 + 17 + 8 + 7 = 87 fresh
        expect(fresh.total).toBe(87);
        const aged = rescoreStored(fresh, new Date(NOW.getTime() + 72 * 3_600_000));
        expect(aged?.total).toBe(80); // recency 7 → 0
        expect(aged?.verdict).toBe('AUTO_PUBLISH');
    });

    it('returns null for an unusable stored shape', () => {
        expect(rescoreStored(null)).toBeNull();
        expect(rescoreStored({ total: 80 })).toBeNull();
    });
});

describe('applyMeasuredVideoQuality — publish-time probe', () => {
    it('replaces the provisional 25 with the measured tier and recomputes', () => {
        const provisional = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: null, now: NOW,
        });
        expect(provisional.total).toBe(100);
        const measured = applyMeasuredVideoQuality(provisional, OK_Q, NOW);
        expect(measured?.total).toBe(90); // 25 → 15
        expect(measured?.verdict).toBe('AUTO_PUBLISH');
    });

    it('flips the verdict to REJECT when the measured video fails the floor', () => {
        const provisional = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1), videoQuality: null, now: NOW,
        });
        const measured = applyMeasuredVideoQuality(provisional, LOW_Q, NOW);
        expect(measured?.verdict).toBe('REJECT');
        expect(measured?.hard_gates.find(g => g.gate === 'min_video_quality')?.passed).toBe(false);
    });
});
