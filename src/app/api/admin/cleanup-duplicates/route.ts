import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { action } = await req.json();
        
        if (action !== 'cleanup-pending') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
        
        console.log('🧹 Cleaning up duplicate posts from pending approvals...\n');
        
        // Fetch all pending posts
        const { data: pendingPosts, error } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, type, claimType, anime_id, timestamp, source, sourceTier, relevance_score')
            .eq('status', 'pending')
            .order('timestamp', { ascending: false });
        
        if (error || !pendingPosts) {
            console.error('Failed to fetch pending posts:', error);
            return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
        }
        
        console.log(`📊 Found ${pendingPosts.length} pending posts\n`);
        
        const duplicatesToDelete: string[] = [];
        const processed = new Set<string>();
        const deletionLog: any[] = [];
        
        // Group by anime_id + claimType (exact duplicates)
        const claimGroups = new Map<string, any[]>();
        
        pendingPosts.forEach(post => {
            if (post.anime_id && post.claimType) {
                const key = `${post.anime_id}:${post.claimType}`;
                if (!claimGroups.has(key)) {
                    claimGroups.set(key, []);
                }
                claimGroups.get(key)!.push(post);
            }
        });
        
        // Find exact claim duplicates - keep highest tier/score, delete rest
        for (const [key, group] of claimGroups) {
            if (group.length > 1) {
                // Sort by tier (ascending) then by relevance score (descending)
                const sorted = group.sort((a, b) => {
                    if (a.sourceTier !== b.sourceTier) {
                        return a.sourceTier - b.sourceTier;
                    }
                    return b.relevance_score - a.relevance_score;
                });
                
                const keep = sorted[0];
                const deletePosts = sorted.slice(1);
                
                deletePosts.forEach((post: any) => {
                    duplicatesToDelete.push(post.id);
                    deletionLog.push({
                        id: post.id,
                        title: post.title,
                        reason: `Exact claim duplicate of ${keep.id}`,
                        key: key
                    });
                });
            }
        }
        
        // Check for title similarity duplicates (75%+)
        for (let i = 0; i < pendingPosts.length; i++) {
            const post = pendingPosts[i];
            if (processed.has(post.id) || duplicatesToDelete.includes(post.id)) continue;
            
            for (let j = i + 1; j < pendingPosts.length; j++) {
                const other = pendingPosts[j];
                if (processed.has(other.id) || duplicatesToDelete.includes(other.id)) continue;
                
                const similarity = calculateSimilarity(post.title, other.title);
                
                if (similarity >= 0.75) {
                    const keepPost = (post.sourceTier < other.sourceTier) || 
                        (post.sourceTier === other.sourceTier && post.relevance_score >= other.relevance_score)
                        ? post : other;
                    const deletePost = keepPost === post ? other : post;
                    
                    duplicatesToDelete.push(deletePost.id);
                    deletionLog.push({
                        id: deletePost.id,
                        title: deletePost.title,
                        reason: `Similar title (${(similarity * 100).toFixed(0)}%)`,
                        similarTo: keepPost.id
                    });
                    
                    processed.add(deletePost.id);
                    processed.add(keepPost.id);
                    break;
                }
            }
        }
        
        // Delete duplicates
        if (duplicatesToDelete.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No duplicates found',
                deleted: 0,
                remaining: pendingPosts.length
            });
        }
        
        let deletedCount = 0;
        let failedCount = 0;
        
        for (const id of duplicatesToDelete) {
            const { error: deleteError } = await supabaseAdmin
                .from('posts')
                .delete()
                .eq('id', id);
            
            if (deleteError) {
                console.error(`Failed to delete ${id}:`, deleteError.message);
                failedCount++;
            } else {
                deletedCount++;
            }
        }
        
        return NextResponse.json({
            success: true,
            message: `Cleanup complete`,
            deleted: deletedCount,
            failed: failedCount,
            remaining: pendingPosts.length - deletedCount,
            log: deletionLog
        });
        
    } catch (error: any) {
        console.error('[Cleanup API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function calculateSimilarity(title1: string, title2: string): number {
    const words1 = extractSignificantWords(title1);
    const words2 = extractSignificantWords(title2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const matches = words1.filter(w => words2.includes(w)).length;
    return matches / Math.max(words1.length, words2.length);
}

function extractSignificantWords(title: string): string[] {
    return title
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^\w]/g, ''))
        .filter(Boolean);
}
