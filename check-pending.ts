import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPendingPosts() {
    console.log('Checking for pending posts...');
    const { data, error, count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: false })
        .eq('status', 'pending');

    if (error) {
        console.error('Error fetching pending posts:', error);
        return;
    }

    console.log(`Total pending posts: ${count}`);
    if (data && data.length > 0) {
        console.log('Sample pending post:', {
            title: data[0].title,
            status: data[0].status,
            source: data[0].source
        });
    } else {
        console.log('No pending posts found in the database.');

        // Check ALL post statuses to see what's there
        const { data: allData } = await supabase.from('posts').select('status').limit(10);
        console.log('Recent post statuses:', allData?.map(p => (p as any).status));
    }
}

checkPendingPosts();
