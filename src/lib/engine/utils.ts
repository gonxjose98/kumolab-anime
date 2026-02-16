import { createHash } from 'crypto';

/**
 * Generates a stable canonical identity for an event.
 * event_fingerprint = hash(anime_id + event_type + canonical_announcement_key + primary_signal_date_or_asset_id)
 */
export function generateEventFingerprint(params: {
    anime_id: string;
    event_type: string;
    canonical_announcement_key: string;
    primary_signal_date_or_asset_id: string;
}): string {
    const { anime_id, event_type, canonical_announcement_key, primary_signal_date_or_asset_id } = params;

    // Normalize components
    const normalizedAnimeId = String(anime_id).toLowerCase().trim();
    const normalizedEventType = String(event_type).toUpperCase().trim();
    const normalizedKey = String(canonical_announcement_key).toLowerCase().trim();
    const normalizedSignal = String(primary_signal_date_or_asset_id).toLowerCase().trim();

    const rawString = `${normalizedAnimeId}|${normalizedEventType}|${normalizedKey}|${normalizedSignal}`;

    return createHash('sha256').update(rawString).digest('hex');
}

/**
 * Generates a TRUTH-BASED fingerprint that ignores the specific source or URL.
 * truth_fingerprint = hash(anime_id + event_type + season_label)
 */
export function generateTruthFingerprint(params: {
    anime_id: string;
    event_type: string;
    season_label?: string;
}): string {
    const { anime_id, event_type, season_label } = params;

    const normalizedAnimeId = String(anime_id).toLowerCase().trim();
    const normalizedEventType = String(event_type).toUpperCase().trim();
    const normalizedSeason = String(season_label || '0').toLowerCase().trim();

    const rawString = `${normalizedAnimeId}|${normalizedEventType}|${normalizedSeason}`;

    return createHash('sha256').update(rawString).digest('hex');
}

/**
 * Look up source in source_tiers table or return default tier 3.
 */
export async function getSourceTier(sourceName: string, supabase: any): Promise<number> {
    if (!sourceName) return 3;

    // Hardcoded overrides for common sources if not in DB
    const sourceLower = sourceName.toLowerCase();
    if (
        sourceLower.includes('animenewsnetwork') ||
        sourceLower.includes('crunchyroll') ||
        sourceLower.includes('variety') ||
        sourceLower.includes('hollywoodreporter') ||
        sourceLower.includes('deadline') ||
        sourceLower.includes('mainichi') ||
        sourceLower.includes('mantan-web')
    ) {
        return 1;
    }

    if (
        sourceLower.includes('anilist') ||
        sourceLower.includes('myanimelist') ||
        sourceLower.includes('twitter') ||
        sourceLower.includes('x.com') ||
        sourceLower.includes('reddit') ||
        sourceLower.includes('instagram')
    ) {
        return 2;
    }

    try {
        const { data, error } = await supabase
            .from('source_tiers')
            .select('tier')
            .eq('source_name', sourceName)
            .single();

        if (error || !data) return 3;
        return data.tier || 3;
    } catch (e) {
        return 3;
    }
}

/**
 * Calculates a relevance score (0-100) based on source tier and content signals.
 */
export function calculateRelevanceScore(post: { title: string; source_tier: number }): number {
    let score = 50;

    // Add points for source tier
    if (post.source_tier === 1) score += 30;
    else if (post.source_tier === 2) score += 15;

    // Content signals
    const titleLower = post.title.toLowerCase();
    const positiveSignals = ["announced", "confirmed", "premiere", "new season", "trailer"];
    const negativeSignals = ["rumor", "speculation", "leak"];

    if (positiveSignals.some(signal => titleLower.includes(signal))) {
        score += 5;
    }

    if (negativeSignals.some(signal => titleLower.includes(signal))) {
        score -= 10;
    }

    // Clamp between 0-100
    return Math.max(0, Math.min(100, score));
}

/**
 * Checks for potential duplicates in existing and declined posts.
 * Uses simple word matching (>70% of significant words > 3 chars).
 */
export async function checkForDuplicate(title: string, supabase: any): Promise<number | string | null> {
    const significantWords = title.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^\w]/g, ''));

    if (significantWords.length === 0) return null;

    // 1. Check declined_posts first
    const { data: declined } = await supabase
        .from('declined_posts')
        .select('id, title');

    for (const item of (declined || [])) {
        if (isDuplicate(significantWords, item.title)) {
            return 'DECLINED'; // Special flag to skip
        }
    }

    // 2. Check existing posts
    const { data: existing } = await supabase
        .from('posts')
        .select('id, title')
        .order('scraped_at', { ascending: false })
        .limit(200);

    for (const item of (existing || [])) {
        if (isDuplicate(significantWords, item.title)) {
            return item.id;
        }
    }

    return null;
}

function isDuplicate(words: string[], otherTitle: string): boolean {
    const otherWords = otherTitle.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^\w]/g, ''));

    if (otherWords.length === 0) return false;

    const matches = words.filter(word => otherWords.includes(word));
    const matchRatio = matches.length / Math.max(words.length, otherWords.length);

    return matchRatio > 0.7;
}
