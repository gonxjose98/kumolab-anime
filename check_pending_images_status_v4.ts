
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
        console.log(`---`);
        console.log(`Title: ${post.title}`);
        console.log(`URL: ${post.image}`);

        if (!post.image) {
            console.log(`Status: NO_IMAGE`);
            continue;
        }

        try {
            const res = await fetch(post.image);
            console.log(`Status: ${res.status} ${res.statusText}`);
            if (!res.ok) {
                const text = await res.text();
                console.log(`Error Body: ${text.substring(0, 200)}`);
            }
        } catch (e: any) {
            console.log(`Fetch Error: ${e.message}`);
        }
    }
}

checkPendingImages();
