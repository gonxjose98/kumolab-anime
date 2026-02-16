
import { fetchSmartTrendingCandidates } from '../src/lib/engine/fetchers';
import { generateIntelPost, generateTrendingPost, validatePost } from '../src/lib/engine/generator';
import { getPosts } from '../src/lib/blog';
import { runBlogEngine } from '../src/lib/engine/engine';
import { logSchedulerRun } from '../src/lib/logging/scheduler';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// Force load envs
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

// Need access to publishPost but it's internal to engine.ts
// I'll create a specific backfill function that leverages the engine's internal publishing logic
// by calling a modified engine loop or just re-implementing the tiny publish loop.

async function runBackfill() {
    console.log("--- KumoLab Backfill Initiation ---");
    const now = new Date();
    const result = await fetchSmartTrendingCandidates();
    const candidates = result.candidates;

    console.log(`Analyzing ${candidates.length} potential candidates...`);

    let publishedCount = 0;

    for (const item of candidates) {
        // Re-fetch existing posts inside the loop to ensure fingerprint check is fresh
        const existingPosts = await getPosts(true);

        console.log(`\nProcessing: ${item.title}`);

        const post = await (item.source === 'KumoLab SmartSync' ? generateTrendingPost(item, now) : generateIntelPost([item], now));

        if (!post) continue;

        if (validatePost(post, existingPosts, false)) {
            console.log(`[BACKFILL] Valid Candidate: ${post.title}. Publishing...`);

            // We need the publishPost logic. Since it's not exported from engine.ts, 
            // I'll temporarily export it or just re-implement the DB upsert here 
            // for the sake of the one-time backfill.

            const { publishPostDirect } = await import('./backfill-helper');
            await publishPostDirect(post);

            publishedCount++;
            console.log(`[SUCCESS] Published #${publishedCount}`);

            // Small Sleep
            await new Promise(r => setTimeout(r, 2000));
        } else {
            console.log(`[SKIP] Already exists or invalid.`);
        }
    }

    console.log(`\n--- Backfill Complete. Total Published: ${publishedCount} ---`);
}

runBackfill().catch(console.error);
