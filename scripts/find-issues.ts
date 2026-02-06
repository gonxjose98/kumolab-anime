
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findIssues() {
    console.log("--- Last 10 Posts ---");
    const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select('id, title, slug, image, timestamp, type')
        .order('timestamp', { ascending: false })
        .limit(10);

    if (postsError) {
        console.error("Error fetching posts:", postsError);
    } else {
        posts?.forEach(p => {
            console.log(`[${p.timestamp}] ID: ${p.id} | TYPE: ${p.type} | IMAGE: ${p.image ? 'YES' : 'MISSING'} | TITLE: ${p.title}`);
            if (p.image) console.log(`  IMAGE URL: ${p.image}`);
        });
    }

    console.log("\n--- Searching for Golden Kamuy Duplicates ---");
    const { data: gkPosts, error: gkError } = await supabase
        .from('posts')
        .select('id, title, slug, image, timestamp')
        .ilike('title', '%Golden Kamuy%');

    if (gkError) {
        console.error("Error fetching Golden Kamuy posts:", gkError);
    } else {
        console.log(`Found ${gkPosts?.length} Golden Kamuy posts:`);
        gkPosts?.forEach(p => {
            console.log(`ID: ${p.id} | [${p.timestamp}] TITLE: ${p.title} | SLUG: ${p.slug}`);
        });
    }
}

findIssues();
