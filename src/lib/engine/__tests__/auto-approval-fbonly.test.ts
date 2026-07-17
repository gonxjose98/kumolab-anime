import { describe, it, expect } from 'vitest';
import { decideAutoApproval } from '@/lib/engine/auto-approval';
import { scorePost } from '@/lib/engine/scoring';

// The Facebook-only key-visual path (Option B, Jose 2026-07-17). A key visual
// is a still, so it maxes at ~54/100 → the /100 model REJECTs it. But it must
// be KEPT as a Facebook-only image, NOT rejected, and must NOT enter the IG
// peak-slot pool. These paths return before any AI/DB call, so they're
// exercisable without mocks.

const NOW = new Date('2026-07-17T18:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** Score a T1 static key visual — 40 + 0 + 6 + 1 + 7 = 54 (would be REJECT). */
function keyVisualScore(tier: 1 | 2 | 3 | null) {
    return scorePost({
        tier, tierMatchedBy: tier ? 'anime' : null, claimType: 'NEW_KEY_VISUAL',
        format: 'static_image', detectedAt: hoursAgo(1), now: NOW,
    });
}

describe('decideAutoApproval — FB-only key visuals', () => {
    it('AUTO-APPROVES a tracked-franchise T1 key visual as FB-only (not REJECT)', async () => {
        const ps = keyVisualScore(1);
        expect(ps.verdict).toBe('REJECT'); // the /100 model alone would reject it
        const d = await decideAutoApproval({
            title: "'Snowball Earth' key visual revealed",
            content: 'new key visual',
            claim_type: 'NEW_KEY_VISUAL',
            source_tier: 1,
            source_name: 'YouTube_TOHO Animation',
            postScore: ps,
            hasImage: true,
            hasVideo: false,
            isT1YouTube: false,
        });
        expect(d.verdict).toBe('AUTO_APPROVE');
        expect(d.fbOnly).toBe(true);
        expect(d.signals.fb_only).toBe(true);
    });

    it('AUTO-APPROVES a T2-source key visual as FB-only', async () => {
        const d = await decideAutoApproval({
            title: "'Re:Zero' new visual",
            content: 'visual',
            claim_type: 'NEW_KEY_VISUAL',
            source_tier: 2,
            source_name: 'AnimeNewsNetwork',
            postScore: keyVisualScore(2),
            hasImage: true,
            hasVideo: false,
            isT1YouTube: false,
        });
        expect(d.verdict).toBe('AUTO_APPROVE');
        expect(d.fbOnly).toBe(true);
    });

    it('routes a T3-source key visual to REVIEW (still flagged FB-only)', async () => {
        const d = await decideAutoApproval({
            title: 'some key visual',
            content: 'visual',
            claim_type: 'NEW_KEY_VISUAL',
            source_tier: 3,
            source_name: 'YouTube_SomeSmallChannel',
            postScore: keyVisualScore(3),
            hasImage: true,
            hasVideo: false,
            isT1YouTube: false,
        });
        expect(d.verdict).toBe('QUEUE_FOR_REVIEW');
        expect(d.fbOnly).toBe(true);
    });

    it('REJECTS a key visual with no image (artifact gate)', async () => {
        const d = await decideAutoApproval({
            title: 'key visual',
            content: 'visual',
            claim_type: 'NEW_KEY_VISUAL',
            source_tier: 1,
            source_name: 'YouTube_TOHO Animation',
            postScore: keyVisualScore(1),
            hasImage: false,
            hasVideo: false,
            isT1YouTube: false,
        });
        expect(d.verdict).toBe('REJECT');
        expect(d.fbOnly).toBeUndefined();
    });

    it('a real-video trailer is NOT flagged fbOnly (stays an IG reel)', async () => {
        const ps = scorePost({
            tier: 1, tierMatchedBy: 'anime', claimType: 'TRAILER_DROP',
            format: 'real_video', detectedAt: hoursAgo(1),
            videoQuality: { height: 1080, bitrate: 3_000_000, fps: 24, quality_tier: 'FULL', real_motion: true },
            now: NOW,
        });
        const d = await decideAutoApproval({
            title: "'Snowball Earth' trailer",
            content: 'trailer',
            claim_type: 'TRAILER_DROP',
            source_tier: 1,
            source_name: 'YouTube_TOHO Animation',
            postScore: ps,
            hasImage: true,
            hasVideo: true,
            isT1YouTube: true,
        });
        expect(d.verdict).toBe('AUTO_APPROVE');
        expect(d.fbOnly).toBeUndefined();
    });
});
