import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { runBlogEngine } from '../src/lib/engine/engine';

async function trigger() {
    console.log("MANUAL TRIGGER: 12:00 (Intel)...");
    const intel = await runBlogEngine('12:00', true);
    console.log("Intel Result:", intel?.title);

    console.log("MANUAL TRIGGER: 16:00 (Trending)...");
    const trending = await runBlogEngine('16:00', true);
    console.log("Trending Result:", trending?.title);
}

trigger();
