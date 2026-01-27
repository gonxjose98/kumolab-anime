
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listTodayPosts() {
    const range = new Date();
    range.setDate(range.getDate() - 2);

    console.log(`--- Posts from ${range.toISOString()} ---`);

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .gte('created_at', range.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching posts:", error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log("No posts found for today.");
        return;
    }

    posts.forEach(p => {
        console.log(`\n[${p.type}] ${p.title} (${p.is_published ? 'LIVE' : 'HIDDEN'})`);
        console.log(`    Slug: ${p.slug}`);
        console.log(`    Image: ${p.image}`);
        console.log(`    Created: ${p.created_at}`);
    });
}

listTodayPosts();
