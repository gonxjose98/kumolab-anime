
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

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

    console.log(`Found ${posts?.length} pending posts.`);

    for (const post of posts || []) {
        console.log(`---`);
        console.log(`Title: ${post.title}`);
        console.log(`ID: ${post.id}`);
        console.log(`Image URL: ${post.image}`);

        if (!post.image) {
            console.log(`Status: NO IMAGE URL`);
            continue;
        }

        try {
            const res = await fetch(post.image, { method: 'HEAD' });
            if (res.ok) {
                console.log(`Status: OK (${res.status})`);
            } else {
                console.log(`Status: BROKEN (${res.status})`);
            }
        } catch (e: any) {
            console.log(`Status: ERROR (${e.message})`);
        }
    }
}

checkPendingImages();
