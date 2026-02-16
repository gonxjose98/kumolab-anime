import { runBlogEngine } from './src/lib/engine/engine';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testEngine() {
    console.log('[Test] Triggering Blog Engine for hourly slot...');
    try {
        const result = await runBlogEngine('hourly', true); // Use dryRun = true first to see what it finds?
        // Actually, let's run it for real (dryRun = false) to let it save to DB
        const realResult = await runBlogEngine('hourly', false);
        if (realResult) {
            console.log('[Test] Engine found and processed:', realResult.title);
            console.log('[Test] Status should be PENDING.');
        } else {
            console.log('[Test] Engine ran but found no new content.');
        }
    } catch (e) {
        console.error('[Test] Engine crash:', e);
    }
}

testEngine();
