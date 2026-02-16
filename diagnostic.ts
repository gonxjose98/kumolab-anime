import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnostic() {
    console.log('--- DIAGNOSTIC START ---');

    // 1. Check if columns actually exist now
    console.log('\nChecking table columns...');
    const { data: columnCheck, error: colError } = await supabase.from('posts').select('status, source_tier, relevance_score, is_duplicate, scheduled_post_time').limit(1);
    if (colError) {
        console.error('❌ DATABASE ERROR: Columns are missing or inaccessible!', colError.message);
    } else {
        console.log('✅ DATABASE OK: Columns found.');
    }

    // 2. Question 3: Last time scraper ran
    console.log('\nChecking last scraper runs...');
    const { data: runs, error: runError } = await supabase
        .from('scheduler_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(5);

    if (runError) {
        console.error('Error fetching logs:', runError);
    } else {
        runs?.forEach(r => console.log(`Run: ${r.timestamp} | Slot: ${r.slot} | Status: ${r.status} | Msg: ${r.message}`));
    }

    // 4. Recent Posts
    console.log('\nChecking recent posts...');
    const { data: recentPosts, error: postError } = await supabase
        .from('posts')
        .select('title, status, created_at, timestamp')
        .order('timestamp', { ascending: false })
        .limit(5);

    if (postError) {
        console.error('Error fetching posts:', postError);
    } else {
        recentPosts?.forEach(p => console.log(`Post: ${p.timestamp} | Status: ${p.status} | Title: ${p.title}`));
    }

    console.log('\n--- DIAGNOSTIC END ---');
}

diagnostic();
