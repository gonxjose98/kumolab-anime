import dotenv from 'dotenv';
// IMPORTANT: Force dotenv to load BEFORE anything else
dotenv.config({ path: '.env.local' });

// Verify keys exist at runtime
console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MISSING");
console.log("Supabase Key:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING");

// Now import the rest
import { runBlogEngine } from '../src/lib/engine/engine';

async function trigger() {
    console.log("MANUAL TRIGGER: 12:00 (Intel)...");
    const intel = await runBlogEngine('12:00', true);
    console.log("Intel Result:", intel?.title || "No post generated");

    console.log("MANUAL TRIGGER: 16:00 (Trending)...");
    const trending = await runBlogEngine('16:00', true);
    console.log("Trending Result:", trending?.title || "No post generated");
}

trigger();
