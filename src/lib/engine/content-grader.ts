/**
 * Content Quality Grader — Assigns A-F letter grades to posts
 *
 * Evaluates 5 dimensions:
 * 1. Source Authority (T1=A baseline, T3=C baseline)
 * 2. Visual Evidence (has image, has video/trailer)
 * 3. Content Completeness (excerpt, anime name, season info, proper title)
 * 4. Freshness (hours since detection)
 * 5. Content Score (from intelligence scoring system)
 *
 * Grade thresholds:
 *   A (90-100): Premium content, auto-publish worthy
 *   B (75-89):  Good content, auto-publish worthy
 *   C (60-74):  Acceptable, needs manual review
 *   D (40-59):  Below standard, likely reject
 *   F (0-39):   Poor quality, auto-reject
 */

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface GradeResult {
    grade: QualityGrade;
    score: number; // 0-100
    breakdown: {
        sourceAuthority: number;   // 0-25
        visualEvidence: number;    // 0-20
        completeness: number;      // 0-25
        freshness: number;         // 0-15
        contentScore: number;      // 0-15
    };
    flags: string[]; // issues found
}

export function gradeContent(post: {
    source_tier?: number;
    source?: string;
    image?: string;
    background_image?: string;
    youtube_video_id?: string;
    youtube_url?: string;
    title?: string;
    excerpt?: string;
    content?: string;
    anime_id?: string;
    season_label?: string;
    type?: string;
    claim_type?: string;
    relevance_score?: number;
    detected_at?: string;
    created_at?: string;
}): GradeResult {
    const breakdown = {
        sourceAuthority: 0,
        visualEvidence: 0,
        completeness: 0,
        freshness: 0,
        contentScore: 0,
    };
    const flags: string[] = [];

    // ── 1. Source Authority (0-25) ──
    const tier = post.source_tier || 3;
    if (tier === 1) {
        breakdown.sourceAuthority = 25;
    } else if (tier === 2) {
        breakdown.sourceAuthority = 18;
    } else {
        breakdown.sourceAuthority = 10;
        flags.push('Low-tier source');
    }

    // ── 2. Visual Evidence (0-20) ──
    const hasImage = !!(post.image || post.background_image);
    const hasVideo = !!(post.youtube_video_id || post.youtube_url);

    if (hasImage) breakdown.visualEvidence += 12;
    else flags.push('No image');

    if (hasVideo) breakdown.visualEvidence += 8;

    // ── 3. Content Completeness (0-25) ──
    if (post.title && post.title.length >= 10) {
        breakdown.completeness += 5;
    } else {
        flags.push('Title too short');
    }

    if (post.excerpt && post.excerpt.length >= 20) {
        breakdown.completeness += 5;
    } else {
        flags.push('Missing or short excerpt');
    }

    if (post.content && post.content.length >= 50) {
        breakdown.completeness += 5;
    }

    if (post.anime_id) {
        breakdown.completeness += 5;
    } else {
        flags.push('No anime ID linked');
    }

    if (post.season_label || post.type || post.claim_type) {
        breakdown.completeness += 5;
    }

    // ── 4. Freshness (0-15) ──
    const refTime = post.detected_at || post.created_at;
    if (refTime) {
        const hoursOld = (Date.now() - new Date(refTime).getTime()) / (1000 * 60 * 60);
        if (hoursOld <= 2) {
            breakdown.freshness = 15;
        } else if (hoursOld <= 6) {
            breakdown.freshness = 12;
        } else if (hoursOld <= 24) {
            breakdown.freshness = 8;
        } else if (hoursOld <= 48) {
            breakdown.freshness = 4;
        } else {
            breakdown.freshness = 1;
            flags.push('Stale content (>48h)');
        }
    } else {
        breakdown.freshness = 8; // neutral if no timestamp
    }

    // ── 5. Content Score mapping (0-15) ──
    const rawScore = post.relevance_score ?? 0;
    if (rawScore >= 7) {
        breakdown.contentScore = 15;
    } else if (rawScore >= 5) {
        breakdown.contentScore = 12;
    } else if (rawScore >= 3) {
        breakdown.contentScore = 8;
    } else if (rawScore >= 1) {
        breakdown.contentScore = 4;
    } else {
        breakdown.contentScore = 0;
        flags.push('Low relevance score');
    }

    // ── Calculate total ──
    const total = breakdown.sourceAuthority + breakdown.visualEvidence
        + breakdown.completeness + breakdown.freshness + breakdown.contentScore;

    let grade: QualityGrade;
    if (total >= 90) grade = 'A';
    else if (total >= 75) grade = 'B';
    else if (total >= 60) grade = 'C';
    else if (total >= 40) grade = 'D';
    else grade = 'F';

    return { grade, score: total, breakdown, flags };
}

/**
 * Should this grade auto-publish?
 * A and B grades from T1/T2 sources can auto-publish.
 * C grades always need manual review.
 */
export function shouldAutoPublish(result: GradeResult, sourceTier: number): boolean {
    if (result.grade === 'A') return sourceTier <= 2;
    if (result.grade === 'B') return sourceTier === 1;
    return false;
}

/**
 * Get a human-readable summary of the grade
 */
export function gradeSummary(result: GradeResult): string {
    const descriptions: Record<QualityGrade, string> = {
        'A': 'Premium quality — auto-publish ready',
        'B': 'Good quality — publish-worthy',
        'C': 'Acceptable — needs manual review',
        'D': 'Below standard — consider rejecting',
        'F': 'Poor quality — auto-reject recommended',
    };
    return `${result.grade} (${result.score}/100) — ${descriptions[result.grade]}`;
}
