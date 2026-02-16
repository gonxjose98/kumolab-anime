
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPendingImages() {
    console.log('Fetching pending posts...');
    const { data: posts, error } = await supabase
        .from('posts')
        .select('id, title, image, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    console.log(`Found ${posts?.length} pending posts.\n`);

    for (const post of posts || []) {
        if (!post.image) {
            console.log(`[NO_IMAGE] ${post.title}`);
            continue;
        }

        try {
            const res = await fetch(post.image, { method: 'GET' }); // Try GET instead of HEAD
            if (res.ok) {
                console.log(`[OK] (${res.status}) ${post.title}`);
            } else {
                console.log(`[BROKEN] (${res.status}) ${post.title}`);
                console.log(`   URL: ${post.image}`);
            }
        } catch (e: any) {
            console.log(`[ERROR] (${e.message}) ${post.title}`);
            console.log(`   URL: ${post.image}`);
        }
    }
}

checkPendingImages();
