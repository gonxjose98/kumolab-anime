
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { supabaseAdmin } from '../src/lib/supabase/admin';

async function purgeStale() {
    console.log("--- Purging Stale/Embarrassing Posts ---");

    // 1. Identify patterns that match the user's "embarrassing" list
    const embarrassingPatterns = [
        "Jujutsu Kaisen Season 3 confirmed",
        "Frieren Season 2 confirmed",
        "Dorohedoro Anime: New Season Confirmed",
        "Hell’s Paradise: New Season Confirmed",
        "My Hero Academia: New Season Confirmed",
        "Golden Kamuy Final: New Season Confirmed",
        "Frieren: New Season Confirmed"
    ];

    for (const pattern of embarrassingPatterns) {
        console.log(`Searching for: ${pattern}`);
        const { data, error } = await supabaseAdmin
            .from('posts')
            .delete()
            .ilike('title', `%${pattern}%`);

        if (error) {
            console.error(`Error deleting ${pattern}:`, error);
        } else {
            console.log(`Deleted successfully.`);
        }
    }
}

purgeStale().catch(console.error);
