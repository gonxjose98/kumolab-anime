/**
 * duplicate-prevention.ts
 * Enhanced duplicate detection and prevention system
 */

import { supabaseAdmin } from '../supabase/admin';
import { BlogPost } from '@/types';

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    duplicateOf: string | null; // Post ID of original
    duplicateType: 'EXACT' | 'SIMILAR' | 'CLAIM' | 'NONE';
    confidence: number; // 0-100
    existingPost: any | null;
    action: 'BLOCK' | 'ALLOW' | 'REVIEW';
    reason: string;
}

/**
 * Multi-layer duplicate detection
 * Layer 1: Exact fingerprint match (event_fingerprint)
 * Layer 2: Truth fingerprint match (same anime + claim type + season)
 * Layer 3: Title similarity (75%+ similar words)
 * Layer 4: Image hash comparison (future enhancement)
 */
export async function detectDuplicate(
    candidate: Partial<BlogPost>,
    options: { 
        checkWindow?: number; // Days to look back (default: 30)
        similarityThreshold?: number; // Default: 0.75
    } = {}
): Promise<DuplicateCheckResult> {
    const { checkWindow = 7, similarityThreshold = 0.65 } = options;
    
    const since = new Date();
    since.setDate(since.getDate() - checkWindow);
    
    // Fetch recent posts for comparison
    const { data: recentPosts, error } = await supabaseAdmin
        .from('posts')
        .select('*')
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false });
    
    if (error || !recentPosts) {
        console.error('[Duplicate Detection] Failed to fetch posts:', error);
        return {
            isDuplicate: false,
            duplicateOf: null,
            duplicateType: 'NONE',
            confidence: 0,
            existingPost: null,
            action: 'ALLOW',
            reason: 'Error fetching comparison data'
        };
    }
    
    // Also check declined posts
    const { data: declinedPosts } = await supabaseAdmin
        .from('declined_posts')
        .select('*')
        .gte('created_at', since.toISOString());
    
    const allPosts = [...recentPosts, ...(declinedPosts || [])];
    
    // LAYER 1: Exact fingerprint match (same source event)
    if (candidate.event_fingerprint) {
        const exactMatch = allPosts.find(p => 
            p.event_fingerprint === candidate.event_fingerprint
        );
        
        if (exactMatch) {
            return {
                isDuplicate: true,
                duplicateOf: exactMatch.id,
                duplicateType: 'EXACT',
                confidence: 100,
                existingPost: exactMatch,
                action: 'BLOCK',
                reason: 'Exact event fingerprint match - same source notification'
            };
        }
    }
    
    // LAYER 2: Truth fingerprint match (same anime + claim + season)
    if (candidate.truth_fingerprint) {
        const truthMatch = allPosts.find(p => 
            p.truth_fingerprint === candidate.truth_fingerprint &&
            p.id !== candidate.id
        );
        
        if (truthMatch) {
            // Check if this adds new information (e.g., different source with higher tier)
            const isNewInformation = candidate.verification_tier && 
                truthMatch.verification_tier &&
                candidate.verification_tier < truthMatch.verification_tier;
            
            if (!isNewInformation) {
                return {
                    isDuplicate: true,
                    duplicateOf: truthMatch.id,
                    duplicateType: 'CLAIM',
                    confidence: 95,
                    existingPost: truthMatch,
                    action: 'BLOCK',
                    reason: 'Same anime claim already exists (no new information)'
                };
            } else {
                // Higher tier source - allow but flag for review
                return {
                    isDuplicate: false,
                    duplicateOf: truthMatch.id,
                    duplicateType: 'CLAIM',
                    confidence: 80,
                    existingPost: truthMatch,
                    action: 'REVIEW',
                    reason: 'Similar claim exists but from lower-tier source - review for upgrade'
                };
            }
        }
    }
    
    // LAYER 2.5: Semantic anime+claim dedup (catches different sources reporting same news)
    // e.g. "Chainsaw Man Season 2 announced" vs "MAPPA confirms Chainsaw Man season 2"
    if (candidate.title) {
        const candidateAnime = extractAnimeFromTitle(candidate.title);
        const candidateClaim = extractClaimFromTitle(candidate.title);

        if (candidateAnime && candidateClaim) {
            for (const existing of allPosts) {
                if (!existing.title) continue;
                const existingAnime = extractAnimeFromTitle(existing.title);
                const existingClaim = extractClaimFromTitle(existing.title);

                if (existingAnime && existingClaim && existingAnime === candidateAnime && existingClaim === candidateClaim) {
                    return {
                        isDuplicate: true,
                        duplicateOf: existing.id,
                        duplicateType: 'CLAIM',
                        confidence: 92,
                        existingPost: existing,
                        action: 'BLOCK',
                        reason: `Same anime "${candidateAnime}" + claim "${candidateClaim}" already exists`
                    };
                }
            }
        }
    }

    // LAYER 3: Title similarity check (lowered threshold to 0.55 for better catch rate)
    if (candidate.title) {
        for (const existing of allPosts) {
            const similarity = calculateTitleSimilarity(candidate.title, existing.title);

            if (similarity >= 0.55) {
                // Check if it's the same claim type
                const sameClaimType = candidate.claimType &&
                    existing.claimType === candidate.claimType;

                if (sameClaimType || similarity >= similarityThreshold) {
                    return {
                        isDuplicate: true,
                        duplicateOf: existing.id,
                        duplicateType: 'SIMILAR',
                        confidence: Math.round(similarity * 100),
                        existingPost: existing,
                        action: 'BLOCK',
                        reason: `Similar title (${Math.round(similarity * 100)}% match)${sameClaimType ? ' with same claim type' : ''}`
                    };
                } else {
                    // Different claim type but similar title - flag for review
                    return {
                        isDuplicate: false,
                        duplicateOf: existing.id,
                        duplicateType: 'SIMILAR',
                        confidence: Math.round(similarity * 100),
                        existingPost: existing,
                        action: 'REVIEW',
                        reason: `Similar title but different claim type - manual review needed`
                    };
                }
            }
        }
    }
    
    // LAYER 4: Anime ID + Time proximity check (catches rapid duplicates)
    if (candidate.anime_id && candidate.claimType) {
        const recentSameAnime = allPosts.find(p => 
            p.anime_id === candidate.anime_id &&
            p.claimType === candidate.claimType &&
            new Date(p.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000) // Within 24 hours
        );
        
        if (recentSameAnime) {
            return {
                isDuplicate: true,
                duplicateOf: recentSameAnime.id,
                duplicateType: 'CLAIM',
                confidence: 90,
                existingPost: recentSameAnime,
                action: 'BLOCK',
                reason: 'Same anime claim posted within last 24 hours'
            };
        }
    }
    
    // No duplicates found
    return {
        isDuplicate: false,
        duplicateOf: null,
        duplicateType: 'NONE',
        confidence: 0,
        existingPost: null,
        action: 'ALLOW',
        reason: 'No duplicates detected'
    };
}

/**
 * Extract anime name from title for semantic dedup
 */
function extractAnimeFromTitle(title: string): string | null {
    const t = title.trim();
    const patterns = [
        /^(.+?)\s+(?:Season|Movie|Film|Anime|Part)\s*\d/i,
        /^(?:New|Latest|Official)\s+(.+?)\s+(?:Trailer|PV|Teaser|Visual|Key Visual|Announced)/i,
        /^(.+?)\s+(?:Announces?|Reveals?|Confirms?|Gets?|Receives?)/i,
        /(?:MAPPA|Ufotable|A-1 Pictures|CloverWorks|Trigger|Bones|Madhouse|WIT Studio|Production I\.G|Toei)\s+(?:Reveals?|Announces?|Confirms?)\s+(.+?)(?:\s+(?:Season|Key Visual|Trailer|PV|Release|Premiere))/i,
        /['"](.+?)['"]\s+(?:Season|Movie|Film|Part|Gets|Receives|Anime)/i,
        /(?:TV Anime|Anime)\s+['"]?(.+?)['"]?\s+(?:Season|Movie|Reveals|Announces|Gets|Receives|New|PV|Trailer)/i,
        /^(.+?)\s*(?:[-–—:|])\s+(?:Season|Trailer|PV|Teaser|Key Visual|Release|New|Official)/i,
    ];
    for (const pattern of patterns) {
        const match = t.match(pattern);
        if (match?.[1]) {
            const name = match[1].trim().replace(/[^\w\s]/g, '').toLowerCase().trim();
            if (name.length >= 3 && !/^(new|the|a|an|this|that|more|first|latest|official|anime)$/i.test(name)) return name;
        }
    }
    return null;
}

/**
 * Extract claim type from title for semantic dedup
 */
function extractClaimFromTitle(title: string): string | null {
    const t = title.toLowerCase();
    if (/trailer|pv|promotional video|teaser/.test(t)) return 'TRAILER';
    if (/season\s*\d+|new season|sequel|2nd season|3rd season|final season|returns for season/.test(t)) return 'SEASON';
    if (/key visual|main visual|visual revealed|new visual/.test(t)) return 'KEY_VISUAL';
    if (/release date|premiere|air date|broadcast/.test(t)) return 'RELEASE_DATE';
    if (/delay|postpone|reschedule/.test(t)) return 'DELAY';
    if (/cast|voice actor|seiyuu|staff|director/.test(t)) return 'CAST';
    if (/announce|confirm|greenlit|green-lit/.test(t)) return 'ANNOUNCEMENT';
    return null;
}

/**
 * Calculate similarity between two titles
 * Uses word overlap with significant word weighting
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string) => s.toLowerCase().trim();
    const extractWords = (s: string) => {
        return normalize(s)
            .split(/\s+/)
            .filter(word => word.length > 2) // Ignore very short words
            .map(word => word.replace(/[^\w]/g, ''))
            .filter(Boolean);
    };
    
    // Extract significant words (anime names are important)
    const significantWords1 = extractWords(title1);
    const significantWords2 = extractWords(title2);
    
    if (significantWords1.length === 0 || significantWords2.length === 0) {
        return 0;
    }
    
    // Count matches
    const matches = significantWords1.filter(w1 => 
        significantWords2.some(w2 => w1 === w2 || (w1.length > 5 && w2.includes(w1)) || (w2.length > 5 && w1.includes(w2)))
    );
    
    // Calculate Jaccard similarity
    const union = new Set([...significantWords1, ...significantWords2]).size;
    const intersection = matches.length;
    
    return union > 0 ? intersection / union : 0;
}

/**
 * Quick check for pending approval queue
 * Used to filter duplicates before they reach your dashboard
 */
export async function filterDuplicatesFromQueue(candidates: Partial<BlogPost>[]): Promise<{
    unique: Partial<BlogPost>[];
    duplicates: { candidate: Partial<BlogPost>; reason: DuplicateCheckResult }[];
}> {
    const unique: Partial<BlogPost>[] = [];
    const duplicates: { candidate: Partial<BlogPost>; reason: DuplicateCheckResult }[] = [];
    
    for (const candidate of candidates) {
        const result = await detectDuplicate(candidate);
        
        if (result.action === 'BLOCK') {
            duplicates.push({ candidate, reason: result });
            console.log(`[Duplicate Filter] BLOCKED: "${candidate.title}" - ${result.reason}`);
        } else if (result.action === 'REVIEW') {
            // Allow but mark for review
            (candidate as any).duplicate_check = result;
            unique.push(candidate);
        } else {
            unique.push(candidate);
        }
    }
    
    console.log(`[Duplicate Filter] Processed ${candidates.length} candidates:`);
    console.log(`  - Unique/Allowed: ${unique.length}`);
    console.log(`  - Blocked: ${duplicates.length}`);
    
    return { unique, duplicates };
}

/**
 * Mark a post as a duplicate in the database
 */
export async function markAsDuplicate(
    duplicateId: string, 
    originalId: string,
    reason: string
): Promise<void> {
    await supabaseAdmin
        .from('posts')
        .update({
            is_duplicate: true,
            duplicate_of: originalId,
            status: 'declined',
            decline_reason: `Duplicate: ${reason}`
        })
        .eq('id', duplicateId);
}

/**
 * Get duplicate statistics for dashboard
 */
export async function getDuplicateStats(): Promise<{
    totalDuplicates: number;
    blockedToday: number;
    recentDuplicates: any[];
}> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: duplicates } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('is_duplicate', true)
        .order('timestamp', { ascending: false });
    
    const blockedToday = duplicates?.filter(d => 
        new Date(d.timestamp) >= today
    ).length || 0;
    
    return {
        totalDuplicates: duplicates?.length || 0,
        blockedToday,
        recentDuplicates: duplicates?.slice(0, 10) || []
    };
}
