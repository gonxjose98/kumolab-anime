/**
 * Clean up duplicate posts from pending approvals
 * Run with: npx ts-node scripts/cleanup-duplicates.ts
 */

import { supabaseAdmin } from '../src/lib/supabase/admin';

async function cleanupPendingDuplicates() {
    console.log('🧹 Cleaning up duplicate posts from pending approvals...\n');
    
    // Fetch all pending posts
    const { data: pendingPosts, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, slug, type, claimType, anime_id, timestamp, source, sourceTier, relevance_score')
        .eq('status', 'pending')
        .order('timestamp', { ascending: false });
    
    if (error || !pendingPosts) {
        console.error('Failed to fetch pending posts:', error);
        return;
    }
    
    console.log(`📊 Found ${pendingPosts.length} pending posts\n`);
    
    const duplicatesToDelete: string[] = [];
    const processed = new Set<string>();
    
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
            console.log(`📌 Found ${group.length} duplicates for ${key}:`);
            
            // Sort by tier (ascending) then by relevance score (descending)
            // Keep the best one (lowest tier number, highest score)
            const sorted = group.sort((a, b) => {
                if (a.sourceTier !== b.sourceTier) {
                    return a.sourceTier - b.sourceTier; // Lower tier = better
                }
                return b.relevance_score - a.relevance_score; // Higher score = better
            });
            
            const keep = sorted[0];
            const deleteIds = sorted.slice(1).map((p: any) => p.id);
            
            console.log(`   ✅ KEEP: "${keep.title.substring(0, 50)}..." (Tier ${keep.sourceTier}, Score ${keep.relevance_score})`);
            sorted.slice(1).forEach((post: any) => {
                console.log(`   ❌ DELETE: "${post.title.substring(0, 50)}..." (Tier ${post.sourceTier}, Score ${post.relevance_score})`);
            });
            
            duplicatesToDelete.push(...deleteIds);
            console.log();
        }
    }
    
    // Check for title similarity duplicates (75%+)
    console.log('\n🔍 Checking for similar title duplicates...\n');
    
    for (let i = 0; i < pendingPosts.length; i++) {
        const post = pendingPosts[i];
        if (processed.has(post.id) || duplicatesToDelete.includes(post.id)) continue;
        
        for (let j = i + 1; j < pendingPosts.length; j++) {
            const other = pendingPosts[j];
            if (processed.has(other.id) || duplicatesToDelete.includes(other.id)) continue;
            
            const similarity = calculateSimilarity(post.title, other.title);
            
            if (similarity >= 0.75) {
                console.log(`📌 Similar titles (${(similarity * 100).toFixed(0)}%):`);
                console.log(`   1. "${post.title.substring(0, 50)}..."`);
                console.log(`   2. "${other.title.substring(0, 50)}..."`);
                
                // Keep the one with better source tier/score
                const keepPost = (post.sourceTier < other.sourceTier) || 
                    (post.sourceTier === other.sourceTier && post.relevance_score >= other.relevance_score)
                    ? post : other;
                const deletePost = keepPost === post ? other : post;
                
                console.log(`   ✅ KEEP: "${keepPost.title.substring(0, 50)}..." (Tier ${keepPost.sourceTier})`);
                console.log(`   ❌ DELETE: "${deletePost.title.substring(0, 50)}..." (Tier ${deletePost.sourceTier})\n`);
                
                duplicatesToDelete.push(deletePost.id);
                processed.add(deletePost.id);
                processed.add(keepPost.id);
                break;
            }
        }
    }
    
    // Delete duplicates
    if (duplicatesToDelete.length === 0) {
        console.log('✅ No duplicates found to delete!\n');
        return;
    }
    
    console.log(`\n🗑️  Deleting ${duplicatesToDelete.length} duplicate posts...\n`);
    
    for (const id of duplicatesToDelete) {
        const { error: deleteError } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', id);
        
        if (deleteError) {
            console.error(`   ❌ Failed to delete ${id}:`, deleteError.message);
        } else {
            console.log(`   ✅ Deleted: ${id.substring(0, 8)}...`);
        }
    }
    
    console.log(`\n✅ Cleanup complete! Deleted ${duplicatesToDelete.length} duplicates.`);
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

// Run cleanup
cleanupPendingDuplicates().catch(console.error);
