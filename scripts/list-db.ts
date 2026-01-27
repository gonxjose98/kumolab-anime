
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function listAllPosts() {
    console.log("Listing top 10 recent posts...");

    // Check connection first
    console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

    const { data, error } = await supabase
        .from('posts')
        .select('title, slug, created_at, is_published')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("DB Error:", error);
    } else {
        console.table(data);
    }
}

listAllPosts();
