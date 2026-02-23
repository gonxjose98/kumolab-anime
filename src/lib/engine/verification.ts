/**
 * verification.ts
 * Content verification and trust scoring utilities
 */

import { VERIFICATION_TIERS, getVerificationTier, classifyContent } from './sources-config';

/**
 * Verification result for a piece of content
 */
export interface VerificationResult {
    tier: keyof typeof VERIFICATION_TIERS;
    score: number;
    badge: string;
    color: string;
    description: string;
    classification: string;
    autoPost: boolean;
    humanReview: boolean;
    priority: string;
}

/**
 * Calculate complete verification status for content
 */
export function calculateVerification(
    claimType: string,
    sourceTier: number,
    sourceName: string,
    crossReferences: string[] = [],
    hasStreamerLink: boolean = false
): VerificationResult {
    // Get verification tier based on source and cross-references
    const tier = getVerificationTier(sourceTier, crossReferences.length);
    const tierConfig = VERIFICATION_TIERS[tier];
    
    // Get content classification
    const classification = classifyContent(claimType, sourceTier, hasStreamerLink);
    
    return {
        tier,
        score: tierConfig.score,
        badge: tierConfig.badge,
        color: tierConfig.color,
        description: tierConfig.description,
        classification: classification.classification,
        autoPost: classification.autoPost,
        humanReview: classification.humanReview,
        priority: classification.priority
    };
}

/**
 * Get visual badge data for UI rendering
 */
export function getBadgeData(tier: keyof typeof VERIFICATION_TIERS) {
    const config = VERIFICATION_TIERS[tier];
    return {
        emoji: config.badge.split(' ')[0],
        text: config.badge.split(' ').slice(1).join(' '),
        color: config.color,
        description: config.description
    };
}

/**
 * Format priority for display
 */
export function formatPriority(priority: string): string {
    const map: Record<string, string> = {
        'immediate': '⚡ Immediate',
        'high': '🔥 High',
        'medium': '📋 Medium',
        'low': '📌 Low',
        'scheduled': '⏰ Scheduled'
    };
    return map[priority] || priority;
}

/**
 * Check if content should skip human review (auto-post eligible)
 */
export function canAutoPost(verification: VerificationResult): boolean {
    return verification.autoPost && verification.score >= 60;
}

/**
 * Get review recommendation text
 */
export function getReviewRecommendation(verification: VerificationResult): string {
    if (verification.autoPost) {
        return 'Auto-post eligible — Verification threshold met';
    }
    if (verification.humanReview) {
        return 'Requires approval — Review source and content';
    }
    return 'Standard review queue';
}
