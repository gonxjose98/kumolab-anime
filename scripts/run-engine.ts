/**
 * run-engine.ts
 * Script to execute the blog engine for a specific slot.
 * Usage: npx tsx scripts/run-engine.ts 08:00
 */

import { runBlogEngine } from '../src/lib/engine/engine';

async function main() {
    const slot = process.argv[2] as '08:00' | '12:00' | '15:00';

    if (!slot || !['08:00', '12:00', '15:00'].includes(slot)) {
        console.error('Usage: npx tsx scripts/run-engine.ts <08:00|12:00|15:00>');
        process.exit(1);
    }

    console.log(`[${new Date().toISOString()}] Running Blog Engine for slot: ${slot}`);

    try {
        const post = await runBlogEngine(slot);
        if (post) {
            console.log(`[SUCCESS] Published post: ${post.title}`);
        } else {
            console.log('[INFO] No post published (criteria not met or already exists).');
        }
    } catch (error) {
        console.error('[ERROR] Engine failure:', error);
        process.exit(1);
    }
}

main();
