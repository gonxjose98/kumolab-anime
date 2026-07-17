/**
 * auto-approval.ts
 *
 * Decision pipeline for each processed candidate:
 *   1. Visual artifact gate (trailer needs a video; everything else needs an image)
 *   2. The /100 score verdict (ENGINE-SCORING-MODEL.md) — AUTHORITATIVE:
 *      REJECT (<55 or a reject hard gate) drops the post; anything under the
 *      75 auto bar (or review-capped by a gate) queues for human review.
 *   3. Claim-type risk matrix — kept as a safety layer on top of the score
 *      (a brand-risky claim can still demote an auto verdict to review/reject).
 *   4. T1-YouTube real-video shortcut: an official channel uploading a video
 *      is evidence by existence — once the /100 verdict is AUTO, skip the AI
 *      checks so a Tier-1 trailer always flows.
 *   5. AniList validation / corroboration / tone+safety for everything else.
 *
 * Returns a decision the processing-worker translates into post.status.
 */

import { claimRisk } from './automation-config';
import { validateAnime } from './anilist-validator';
import { hasCorroboration } from './corroboration';
import { AntigravityAI } from './ai';
import { PostScore, SCORE_AUTO_PUBLISH_MIN } from './scoring';

export interface AutoApprovalInput {
    title: string;
    content: string;
    anime_id?: string | number | null;
    claim_type?: string | null;
    source_tier?: number;
    source_name?: string;
    /** The /100 score from scorePost() — the authoritative publish gate. */
    postScore: PostScore;
    hasImage: boolean;
    hasVideo: boolean;       // youtube_video_id (or other embeddable video) is set on the post
    isT1YouTube: boolean;
}

export interface AutoApprovalDecision {
    verdict: 'AUTO_APPROVE' | 'QUEUE_FOR_REVIEW' | 'REJECT';
    reason: string;
    signals: Record<string, any>;
    /** true for a Facebook-only key-visual image: a separate product from the
     *  IG video reels. The processing worker schedules these on their own
     *  off-peak grid (assignFbOnlySlot) instead of the IG peak-slot pool. */
    fbOnly?: boolean;
}

export async function decideAutoApproval(input: AutoApprovalInput): Promise<AutoApprovalDecision> {
    const signals: Record<string, any> = {};

    const claim = (input.claim_type || '').toUpperCase();
    const ps = input.postScore;
    signals.post_score = ps.total;
    signals.score_verdict = ps.verdict;
    const failedGates = ps.hard_gates.filter(g => !g.passed).map(g => g.gate);
    if (failedGates.length) signals.failed_gates = failedGates;

    // ── Visual artifact gate ─────────────────────────────────────
    // TRAILER_DROP MUST have a video — a trailer post with no embed is broken.
    // Everything else (visuals, news, dates, staff) MUST have an image. Image
    // acquisition runs upstream in processing-worker (RSS → selectBestImage
    // fallback). If we still don't have one by the time we reach this gate,
    // the picture pipeline genuinely failed — drop the post rather than
    // pile up image-less rows in the manual review queue (Jose's rule:
    // "non-video posts should come with a picture", no exceptions).
    if (claim === 'TRAILER_DROP') {
        if (!input.hasVideo) {
            return { verdict: 'QUEUE_FOR_REVIEW', reason: 'trailer claim missing video — extraction failed', signals };
        }
        signals.artifact = 'video';
    } else {
        if (!input.hasImage) {
            return { verdict: 'REJECT', reason: 'no image — every fallback (RSS + AniList + OG + Reddit) failed', signals };
        }
        signals.artifact = 'image';
    }

    // ── Key visuals are a SEPARATE Facebook-only product ─────────
    // A key visual is a still image, so it can NEVER clear the /100 video-reel
    // bar (max ~54 → REJECT). But Jose keeps them as a Facebook-only image
    // trickle (publisher's video-only-policy exception, ≤3/day) that must not
    // touch or consume any of the 3 IG peak slots. So key visuals bypass the
    // /100 reject cutoff AND the IG peak-slot pool entirely. Eligibility reuses
    // the claim-risk matrix (NEW_KEY_VISUAL is AUTO at T1/T2, REVIEW at T3).
    // The artifact gate above already guaranteed hasImage.
    if (claim === 'NEW_KEY_VISUAL') {
        const kvRisk = claimRisk(input.claim_type ?? undefined, input.source_tier);
        signals.risk = kvRisk;
        signals.fb_only = true;
        if (kvRisk === 'REJECT') {
            return { verdict: 'REJECT', reason: `key visual at tier ${input.source_tier} is not publishable`, signals };
        }
        if (kvRisk !== 'AUTO') {
            return { verdict: 'QUEUE_FOR_REVIEW', reason: `key visual at tier ${input.source_tier} requires human review`, signals, fbOnly: true };
        }
        return {
            verdict: 'AUTO_APPROVE',
            reason: `key visual → Facebook-only image (score ${ps.total}/100, IG-reel gate bypassed)`,
            signals,
            fbOnly: true,
        };
    }

    // ── /100 verdict (authoritative) ─────────────────────────────
    if (ps.verdict === 'REJECT') {
        return {
            verdict: 'REJECT',
            reason: `score ${ps.total}/100 REJECT${failedGates.length ? ` (gates: ${failedGates.join(', ')})` : ' (below 55)'}`,
            signals,
        };
    }

    // Claim-type + tier risk matrix — safety layer on top of the score.
    const risk = claimRisk(input.claim_type ?? undefined, input.source_tier);
    signals.risk = risk;

    if (risk === 'REJECT') {
        return { verdict: 'REJECT', reason: `claim ${input.claim_type || 'OTHER'} at tier ${input.source_tier} is not publishable`, signals };
    }
    if (risk === 'REVIEW') {
        return { verdict: 'QUEUE_FOR_REVIEW', reason: `claim ${input.claim_type} at tier ${input.source_tier} requires human review`, signals };
    }

    if (ps.verdict !== 'AUTO_PUBLISH') {
        return {
            verdict: 'QUEUE_FOR_REVIEW',
            reason: `score ${ps.total}/100 below auto bar ${SCORE_AUTO_PUBLISH_MIN}${failedGates.length ? ` (gates: ${failedGates.join(', ')})` : ''}`,
            signals,
        };
    }

    // ── T1 YouTube real-video shortcut — self-verifying, skip AI checks ──
    // An official channel uploading its own trailer is evidence by existence.
    // The /100 verdict already cleared the tier + category + quality bars.
    if (input.isT1YouTube && input.hasVideo) {
        signals.shortcut = 't1_youtube_real_video';
        return { verdict: 'AUTO_APPROVE', reason: `T1 YouTube video + score ${ps.total}/100`, signals };
    }

    // AniList validation (only if we have an anime_id)
    if (input.anime_id) {
        const anilist = await validateAnime({ anime_id: input.anime_id, title: input.title });
        signals.anilist = { exists: anilist.exists, canonicalTitle: anilist.canonicalTitle, reason: anilist.reason };
        if (!anilist.exists && anilist.reason !== 'anilist_unreachable') {
            return { verdict: 'QUEUE_FOR_REVIEW', reason: `AniList could not verify anime (${anilist.reason})`, signals };
        }
    }

    // Corroboration for medium-risk claims
    if (risk === 'CORROBORATE') {
        const corroboration = await hasCorroboration({
            anime_id: input.anime_id,
            claim_type: input.claim_type,
            currentSource: input.source_name,
        });
        signals.corroboration = {
            ok: corroboration.ok,
            sourceCount: corroboration.sourceCount,
            windowHours: corroboration.windowHours,
        };
        if (!corroboration.ok) {
            return {
                verdict: 'QUEUE_FOR_REVIEW',
                reason: `insufficient corroboration (${corroboration.sourceCount} sources in ${corroboration.windowHours}h window)`,
                signals,
            };
        }
    }

    // Tone + safety pass (last — cheapest at the end if all else passed)
    const tone = await AntigravityAI.getInstance().checkToneAndSafety(input.title, input.content);
    signals.tone = tone;
    if (!tone.safe || !tone.on_brand || !tone.factually_hedged) {
        return {
            verdict: 'QUEUE_FOR_REVIEW',
            reason: `tone/safety pass flagged: ${tone.reason}`,
            signals,
        };
    }

    return {
        verdict: 'AUTO_APPROVE',
        reason: `risk=${risk} score=${ps.total}/100 corroborated + safe`,
        signals,
    };
}
