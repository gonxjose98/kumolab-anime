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
    hasVideo: boolean;       // youtube_video_id (or other embeddable video) is set on the post
    isT1YouTube: boolean;
}

export interface AutoApprovalDecision {
    verdict: 'AUTO_APPROVE' | 'QUEUE_FOR_REVIEW' | 'REJECT';
    reason: string;
    signals: Record<string, any>;
}

const SCORE_AUTO_MIN = 6;              // Below this we never auto-publish
const SCORE_AUTO_HIGH = 7;              // T1-YouTube shortcut kicks in at this score (matches SCORING_THRESHOLDS.HIGH_CONFIDENCE)

export async function decideAutoApproval(input: AutoApprovalInput): Promise<AutoApprovalDecision> {
    const signals: Record<string, any> = {};

    const claim = (input.claim_type || '').toUpperCase();

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

    if (input.score < SCORE_AUTO_MIN) {
        return { verdict: 'QUEUE_FOR_REVIEW', reason: `score ${input.score} below auto threshold ${SCORE_AUTO_MIN}`, signals };
    }

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
