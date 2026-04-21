/**
 * duplicate-checker.ts
 * Detects and reports duplicates in existing posts
 */

import { supabaseAdmin } from '../supabase/admin';

interface DuplicateGroup {
    key: string;
    posts: any[];
    similarity: number;
}

export async function checkExistingDuplicates() {
    console.log('🔍 Checking for duplicates in existing posts...\n');
    
    // Fetch all posts
    const { data: posts, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, slug, type, claim_type, anime_id, timestamp, status, is_published')
        .order('timestamp', { ascending: false });
    
    if (error || !posts) {
        console.error('Failed to fetch posts:', error);
        return;
    }
    
    console.log(`📊 Total posts in database: ${posts.length}\n`);
    
    const duplicates: DuplicateGroup[] = [];
    const processed = new Set<string>();
    
    // Check each post against others
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        if (processed.has(post.id)) continue;
        
        const similarPosts = [post];
        
        for (let j = i + 1; j < posts.length; j++) {
            const other = posts[j];
            if (processed.has(other.id)) continue;
            
            // Calculate similarity
            const similarity = calculateSimilarity(post.title, other.title);
            
            if (similarity >= 0.75) {
                similarPosts.push(other);
                processed.add(other.id);
            }
        }
        
        if (similarPosts.length > 1) {
            duplicates.push({
                key: generateKey(post.title),
                posts: similarPosts,
                similarity: calculateSimilarity(similarPosts[0].title, similarPosts[1]?.title || '')
            });
        }
        
        processed.add(post.id);
    }
    
    // Report findings
    if (duplicates.length === 0) {
        console.log('✅ No duplicates found!\n');
    } else {
        console.log(`⚠️  Found ${duplicates.length} duplicate groups:\n`);
        
        duplicates.forEach((group, idx) => {
            console.log(`\n📌 DUPLICATE GROUP #${idx + 1} (${group.posts.length} posts, ${(group.similarity * 100).toFixed(0)}% similar):`);
            console.log('─'.repeat(60));
            
            group.posts.forEach((post, pidx) => {
                const date = new Date(post.timestamp).toLocaleDateString();
                const status = post.status === 'pending' ? '⏳ PENDING' : 
                              post.status === 'published' ? '✅ PUBLISHED' : 
                              post.status === 'declined' ? '❌ DECLINED' : post.status;
                console.log(`  ${pidx + 1}. "${post.title}"`);
                console.log(`     ID: ${post.id.substring(0, 8)}... | ${date} | ${status}`);
                console.log(`     Slug: ${post.slug}`);
            });
        });
        
        console.log('\n\n📋 RECOMMENDATION:');
        console.log('   Consider keeping only the most recent/verified post from each group.');
        console.log('   Declined posts are already filtered from the main feed.\n');
    }
    
    // Also check for exact anime_id + claim_type duplicates
    console.log('\n🔍 Checking for exact claim duplicates...\n');
    
    const claimGroups = new Map<string, any[]>();
    
    posts.forEach(post => {
        if (post.anime_id && post.claim_type) {
            const key = `${post.anime_id}:${post.claim_type}`;
            if (!claimGroups.has(key)) {
                claimGroups.set(key, []);
            }
            claimGroups.get(key)!.push(post);
        }
    });
    
    const exactDuplicates = Array.from(claimGroups.entries())
        .filter(([_, group]) => group.length > 1)
        .sort((a, b) => b[1].length - a[1].length);
    
    if (exactDuplicates.length > 0) {
        console.log(`⚠️  Found ${exactDuplicates.length} exact claim duplicates:\n`);
        
        exactDuplicates.slice(0, 10).forEach(([key, group], idx) => {
            console.log(`\n📌 ${key} (${group.length} posts):`);
            group.forEach((post: any) => {
                const date = new Date(post.timestamp).toLocaleDateString();
                console.log(`   - "${post.title.substring(0, 50)}..." (${date})`);
            });
        });
    } else {
        console.log('✅ No exact claim duplicates found!\n');
    }
    
    return {
        totalPosts: posts.length,
        duplicateGroups: duplicates.length,
        exactClaimDuplicates: exactDuplicates.length,
        pendingDuplicates: duplicates.filter(g => 
            g.posts.some((p: any) => p.status === 'pending')
        ).length
    };
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

function generateKey(title: string): string {
    return extractSignificantWords(title).slice(0, 3).join('-');
}

// Run if called directly
if (require.main === module) {
    checkExistingDuplicates().then(results => {
        console.log('\n📊 SUMMARY:');
        console.log(`   Total Posts: ${results?.totalPosts}`);
        console.log(`   Similar Title Groups: ${results?.duplicateGroups}`);
        console.log(`   Exact Claim Duplicates: ${results?.exactClaimDuplicates}`);
        console.log(`   Pending Duplicates: ${results?.pendingDuplicates}`);
        process.exit(0);
    }).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}
