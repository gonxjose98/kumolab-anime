/**
 * auto-approval.ts
 *
 * Decision pipeline for each processed candidate:
 *   1. Claim-type risk gate (rejects OTHER/junk; fast-tracks AUTO; corroborates CORROBORATE; always-queues REVIEW)
 *   2. AniList validation (if we have an anime_id, it must resolve)
 *   3. Multi-source corroboration (for CORROBORATE claims)
 *   4. Tone + safety AI pass (brand-voice guardrail)
 *   5. Final verdict + human-readable reason
 *
 * Returns a decision the processing-worker translates into post.status.
 */

import { claimRisk } from './automation-config';
import { validateAnime } from './anilist-validator';
import { hasCorroboration } from './corroboration';
import { AntigravityAI } from './ai';

export interface AutoApprovalInput {
    title: string;
    content: string;
    anime_id?: string | number | null;
    claim_type?: string | null;
    source_tier?: number;
    source_name?: string;
    score: number;
    hasImage: boolean;
    isT1YouTube: boolean;
}

export interface AutoApprovalDecision {
    verdict: 'AUTO_APPROVE' | 'QUEUE_FOR_REVIEW' | 'REJECT';
    reason: string;
    signals: Record<string, any>;
}

const SCORE_AUTO_MIN = 6;              // Below this we never auto-publish
const SCORE_AUTO_HIGH = 7;              // T1-YouTube shortcut kicks in at this score (matches SCORING_THRESHOLDS.HIGH_CONFIDENCE)

// Claim types whose content IS the visual artifact — a TRAILER post doesn't need a
// separate generated card image because the trailer itself is the content. Same for
// key-visual reveals where the visual ships with the post.
const VIDEO_OR_VISUAL_CLAIMS = new Set(['TRAILER_DROP', 'NEW_KEY_VISUAL']);

export async function decideAutoApproval(input: AutoApprovalInput): Promise<AutoApprovalDecision> {
    const signals: Record<string, any> = {};

    const claim = (input.claim_type || '').toUpperCase();
    const isVideoOrVisualClaim = VIDEO_OR_VISUAL_CLAIMS.has(claim);

    // Hard gates that apply to every candidate
    if (!input.hasImage && !isVideoOrVisualClaim) {
        return { verdict: 'QUEUE_FOR_REVIEW', reason: 'no image — requires manual image selection', signals };
    }
    if (input.score < SCORE_AUTO_MIN) {
        return { verdict: 'QUEUE_FOR_REVIEW', reason: `score ${input.score} below auto threshold ${SCORE_AUTO_MIN}`, signals };
    }
    signals.imageGate = input.hasImage ? 'has_image' : (isVideoOrVisualClaim ? 'bypassed_video_visual' : 'blocked_no_image');

    // Claim-type + tier risk matrix
    const risk = claimRisk(input.claim_type, input.source_tier);
    signals.risk = risk;

    if (risk === 'REJECT') {
        return { verdict: 'REJECT', reason: `claim ${input.claim_type || 'OTHER'} at tier ${input.source_tier} is not publishable`, signals };
    }
    if (risk === 'REVIEW') {
        return { verdict: 'QUEUE_FOR_REVIEW', reason: `claim ${input.claim_type} at tier ${input.source_tier} requires human review`, signals };
    }

    // ── T1 YouTube high-confidence shortcut — self-verifying, skip extra checks ──
    // An official channel uploading a trailer is evidence by existence.
    if (input.isT1YouTube && input.score >= SCORE_AUTO_HIGH) {
        signals.shortcut = 't1_youtube_high_confidence';
        return { verdict: 'AUTO_APPROVE', reason: `T1 YouTube + score ${input.score}`, signals };
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
        reason: `risk=${risk} score=${input.score} corroborated + safe`,
        signals,
    };
}
