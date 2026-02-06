
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupDuplicates() {
    console.log('--- KumoLab Duplication Cleanup Pass ---');

    // 1. Fetch all published posts
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('is_published', true)
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log('No published posts found.');
        return;
    }

    console.log(`Total live posts: ${posts.length}\n`);

    const seenTitles = new Map<string, string>(); // normalizedTitle -> firstPostId
    const seenSlugs = new Map<string, string>(); // slug -> firstPostId
    const seenContentPrefixes = new Map<string, string>(); // contentPrefix -> firstPostId

    let removedCount = 0;
    const toUnpublish: string[] = [];

    for (const post of posts) {
        const normalizedTitle = post.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const slug = post.slug;
        const contentPrefix = post.content ? post.content.substring(0, 100) : '';

        let isDuplicate = false;
        let reason = '';

        if (seenTitles.has(normalizedTitle)) {
            isDuplicate = true;
            reason = `Duplicate Title (Keep: ${seenTitles.get(normalizedTitle)})`;
        } else if (seenSlugs.has(slug)) {
            isDuplicate = true;
            reason = `Duplicate Slug (Keep: ${seenSlugs.get(slug)})`;
        } else if (contentPrefix && seenContentPrefixes.has(contentPrefix)) {
            isDuplicate = true;
            reason = `Duplicate Content (Keep: ${seenContentPrefixes.get(contentPrefix)})`;
        }

        if (isDuplicate) {
            console.log(`[DUPLICATE] Unpublishing: "${post.title}" (ID: ${post.id})`);
            console.log(`    Reason: ${reason}`);
            toUnpublish.push(post.id);
            removedCount++;
        } else {
            // New unique post (found first because of sort order)
            seenTitles.set(normalizedTitle, post.id);
            seenSlugs.set(slug, post.id);
            if (contentPrefix) seenContentPrefixes.set(contentPrefix, post.id);
        }
    }

    if (toUnpublish.length > 0) {
        console.log(`\nStarting unpublish batch for ${toUnpublish.length} posts...`);

        // Split into chunks of 50 to avoid any potential batch limits
        const chunkSize = 50;
        for (let i = 0; i < toUnpublish.length; i += chunkSize) {
            const chunk = toUnpublish.slice(i, i + chunkSize);
            const { error: updateError } = await supabase
                .from('posts')
                .update({ is_published: false })
                .in('id', chunk);

            if (updateError) {
                console.error(`Error unpublishing batch:`, updateError);
            }
        }
    }

    console.log('\n--- Cleanup Results ---');
    console.log(`Duplicates Removed: ${removedCount}`);
    console.log(`Remaining Live:    ${posts.length - removedCount}`);
}

cleanupDuplicates().catch(console.error);
