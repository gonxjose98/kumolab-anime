import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function testSupabase() {
    console.log("Testing Supabase Service Role...");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !key) {
        console.error("Missing Supabase credentials");
        return;
    }

    const admin = createClient(url, key);

    // Try a simple admin read
    const { data, error } = await admin.from('posts').select('count').limit(1).single();

    if (error) {
        console.error("Supabase Admin FAILED:", error.message);
    } else {
        console.log("Supabase Admin Success! Post count available.");
    }
}

testSupabase();
