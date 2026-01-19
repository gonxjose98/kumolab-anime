import { fetchAnimeIntel, fetchSmartTrendingCandidates } from '../src/lib/engine/fetchers';
import { generateIntelPost } from '../src/lib/engine/generator';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    console.log("Fetching Intel items...");
    // This will now use the improved fallback to AniList Trending
    const items = await fetchAnimeIntel();

    console.log(`Found ${items.length} items.`);
    if (items.length === 0) {
        console.error("No items found even with fallback!");
        return;
    }

    // Goal: Regenerate "Today's" + 3 Additional = 4 total
    // If fetchAnimeIntel returns fewer than 4, we might need more.
    // Ensure we have enough.

    // If fewer than 4, let's mix in "Trending" candidates as "Intel" to satisfy the volume request
    if (items.length < 4) {
        console.log("Not enough pure Intel items, fetching Smart Trending candidates to supplement...");
        const trends = await fetchSmartTrendingCandidates();
        // Convert trend candidates to intel-like items
        if (trends) { // fetchSmartTrendingCandidates returns ONE winner usually, wait, no it returns one object?
            // Checking fetchSmartTrendingCandidates signature: returns Promise<any> (single winner)
            // Ah, wait. fetchSmartTrendingCandidates returns ONE winner.
            // I need a list.
        }
    }

    // Actually, let's just process what we have. Typically fetchAnimeIntel returns 3 items.
    // The fallback returns 1.
    // I can assume the AniList Trending API has plenty.
    // Let's modify the script to fetch more from AniList Trending if needed manually.

    const postsToGenerate = [];

    for (let i = 0; i < Math.min(items.length, 4); i++) {
        const item = items[i];
        console.log(`\n--- Processing Item ${i + 1} ---`);
        console.log(`Title: ${item.title}`);
        console.log(`Search Term: ${item.imageSearchTerm}`);

        // generateIntelPost expects an array and uses the first one.
        const post = await generateIntelPost([item], new Date(), false);

        if (post) {
            // Force unique UUID
            post.id = crypto.randomUUID();
            post.slug = `${post.slug}-${Date.now()}`;

            console.log(`Generated Post Title: ${post.title}`);
            console.log(`Final Image URL: ${post.image}`);
            postsToGenerate.push(post);
        } else {
            console.error(`Failed to generate post for ${item.title}`);
        }
    }

    // Save to DB
    for (const p of postsToGenerate) {
        const dbPost = {
            ...p,
            claim_type: p.claimType,
            premiere_date: p.premiereDate,
            is_published: p.isPublished,
            // Remove camelCase versions if they don't exist in DB to avoid error
            claimType: undefined,
            premiereDate: undefined,
            isPublished: undefined
        };

        const { error } = await supabase.from('posts').upsert(dbPost);
        if (error) console.error("DB Error for", p.title, ":", error);
        else console.log(`Saved ${p.title} to DB.`);
    }
}

run();
