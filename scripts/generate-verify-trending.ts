import { fetchTrendingSignals } from '../src/lib/engine/fetchers';
import { generateTrendingPost } from '../src/lib/engine/generator';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    console.log("Fetching Trending Signals...");
    const signals = await fetchTrendingSignals();

    console.log(`Found ${signals.length} trending items.`);
    if (signals.length === 0) {
        console.error("No trending signals found!");
        return;
    }

    const postsToGenerate = [];

    // Force generation of up to 3 posts for verification
    for (let i = 0; i < Math.min(signals.length, 3); i++) {
        const item = signals[i];
        console.log(`\n--- Processing Trending Item ${i + 1} ---`);
        console.log(`Title: ${item.title}`);
        console.log(`Reason: ${item.trendReason}`);

        const post = await generateTrendingPost(item, new Date());

        if (post) {
            // Force unique ID/Slug to avoid conflicts with existing live posts
            post.id = crypto.randomUUID();
            post.slug = `${post.slug}-verify-${Date.now()}`;

            console.log(`Generated: ${post.title}`);
            console.log(`Image: ${post.image}`);
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
            // Remove camelCase versions
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
