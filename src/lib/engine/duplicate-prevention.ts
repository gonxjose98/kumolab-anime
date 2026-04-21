/**
 * duplicate-prevention.ts
 * v2 — unified dedup via the seen_fingerprints table.
 *
 * Layers:
 *  1. Primary fingerprint — seen_fingerprints PK lookup (covers every row that was
 *     ever processed/declined/published for as long as seen_fingerprints retains it).
 *  2. Semantic anime+claim — (anime_id, claim_type) lookup in seen_fingerprints
 *     catches different sources reporting the same event with different phrasings.
 *  3. Title similarity — Jaccard over recent LIVE posts (posts table, last N days).
 *     Defense-in-depth for cases where fingerprint hashing differs but content is near-identical.
 */

import { supabaseAdmin } from '../supabase/admin';
import { BlogPost } from '@/types';

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    duplicateOf: string | null;
    duplicateType: 'EXACT' | 'SIMILAR' | 'CLAIM' | 'NONE';
    confidence: number;
    existingPost: any | null;
    action: 'BLOCK' | 'ALLOW' | 'REVIEW';
    reason: string;
}

interface DuplicateInput extends Partial<BlogPost> {
    fingerprint?: string;
}

function computeFingerprint(title: string, url?: string): string {
    const normalized = title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
    const domain = (url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    let hash = 0;
    const input = normalized + '|' + domain;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash & hash;
    }
    return `${normalized.replace(/\s/g, '_').substring(0, 40)}_${Math.abs(hash).toString(36)}`;
}

export async function detectDuplicate(
    candidate: DuplicateInput,
    options: {
        checkWindow?: number; // Days to look back for title similarity (default: 7)
        similarityThreshold?: number; // Default: 0.65
    } = {}
): Promise<DuplicateCheckResult> {
    const { checkWindow = 7, similarityThreshold = 0.65 } = options;

    // Derive a fingerprint from title + source if the caller didn't supply one.
    const fp = candidate.fingerprint ||
        (candidate.title ? computeFingerprint(candidate.title, candidate.source_url || (candidate as any).source) : null);

    // ── LAYER 1: Primary fingerprint lookup ────────────────────────
    if (fp) {
        const { data: fpMatch } = await supabaseAdmin
            .from('seen_fingerprints')
            .select('fingerprint, origin, anime_id, claim_type')
            .eq('fingerprint', fp)
            .maybeSingle();

        if (fpMatch) {
            return {
                isDuplicate: true,
                duplicateOf: null,
                duplicateType: 'EXACT',
                confidence: 100,
                existingPost: null,
                action: 'BLOCK',
                reason: `Fingerprint already seen (origin: ${fpMatch.origin})`,
            };
        }
    }

    // ── LAYER 2: Semantic anime + claim lookup ─────────────────────
    const claim = (candidate as any).claimType || (candidate as any).claim_type;
    if (candidate.anime_id && claim) {
        const { data: semMatch } = await supabaseAdmin
            .from('seen_fingerprints')
            .select('fingerprint, origin')
            .eq('anime_id', candidate.anime_id)
            .eq('claim_type', claim)
            .limit(1)
            .maybeSingle();

        if (semMatch) {
            return {
                isDuplicate: true,
                duplicateOf: null,
                duplicateType: 'CLAIM',
                confidence: 95,
                existingPost: null,
                action: 'BLOCK',
                reason: `Same anime + claim already recorded (origin: ${semMatch.origin})`,
            };
        }
    }

    // ── LAYER 3: Title similarity vs. live posts in the window ─────
    if (candidate.title) {
        const since = new Date();
        since.setDate(since.getDate() - checkWindow);

        const { data: recentPosts } = await supabaseAdmin
            .from('posts')
            .select('id, title, claim_type, anime_id, timestamp')
            .gte('timestamp', since.toISOString())
            .order('timestamp', { ascending: false })
            .limit(200);

        if (recentPosts) {
            for (const existing of recentPosts) {
                if (!existing.title || existing.id === (candidate as any).id) continue;
                const similarity = calculateTitleSimilarity(candidate.title, existing.title);

                if (similarity >= 0.55) {
                    const sameClaim = !!claim && existing.claim_type === claim;

                    if (sameClaim || similarity >= similarityThreshold) {
                        return {
                            isDuplicate: true,
                            duplicateOf: existing.id,
                            duplicateType: 'SIMILAR',
                            confidence: Math.round(similarity * 100),
                            existingPost: existing,
                            action: 'BLOCK',
                            reason: `Similar title (${Math.round(similarity * 100)}%)${sameClaim ? ' + same claim' : ''}`,
                        };
                    } else {
                        return {
                            isDuplicate: false,
                            duplicateOf: existing.id,
                            duplicateType: 'SIMILAR',
                            confidence: Math.round(similarity * 100),
                            existingPost: existing,
                            action: 'REVIEW',
                            reason: `Similar title but different claim type — review`,
                        };
                    }
                }
            }
        }
    }

    return {
        isDuplicate: false,
        duplicateOf: null,
        duplicateType: 'NONE',
        confidence: 0,
        existingPost: null,
        action: 'ALLOW',
        reason: 'No duplicates detected',
    };
}

export function calculateTitleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string) => s.toLowerCase().trim();
    const extractWords = (s: string) =>
        normalize(s)
            .split(/\s+/)
            .filter(word => word.length > 2)
            .map(word => word.replace(/[^\w]/g, ''))
            .filter(Boolean);

    const words1 = extractWords(title1);
    const words2 = extractWords(title2);
    if (words1.length === 0 || words2.length === 0) return 0;

    const matches = words1.filter(w1 =>
        words2.some(w2 => w1 === w2 || (w1.length > 5 && w2.includes(w1)) || (w2.length > 5 && w1.includes(w2)))
    );

    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? matches.length / union : 0;
}

export async function filterDuplicatesFromQueue(
    candidates: Partial<BlogPost>[],
): Promise<{
    unique: Partial<BlogPost>[];
    duplicates: { candidate: Partial<BlogPost>; reason: DuplicateCheckResult }[];
}> {
    const unique: Partial<BlogPost>[] = [];
    const duplicates: { candidate: Partial<BlogPost>; reason: DuplicateCheckResult }[] = [];

    for (const candidate of candidates) {
        const result = await detectDuplicate(candidate);
        if (result.action === 'BLOCK') {
            duplicates.push({ candidate, reason: result });
        } else {
            if (result.action === 'REVIEW') (candidate as any).duplicate_check = result;
            unique.push(candidate);
        }
    }

    return { unique, duplicates };
}

/**
 * Legacy admin-dashboard stats shim.
 * The old columns (is_duplicate, duplicate_of) are gone — the new design records
 * duplicates by their absence (fingerprint in seen_fingerprints, no post row).
 * We still return a compatible shape so the admin UI renders without 500ing.
 */
export async function getDuplicateStats(): Promise<{
    totalDuplicates: number;
    blockedToday: number;
    recentDuplicates: any[];
}> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count blocked-duplicate decisions recorded in scraper_logs today.
    const { data: blocked } = await supabaseAdmin
        .from('scraper_logs')
        .select('id')
        .eq('decision', 'rejected_duplicate')
        .gte('created_at', today.toISOString());

    return {
        totalDuplicates: 0,
        blockedToday: blocked?.length || 0,
        recentDuplicates: [],
    };
}
