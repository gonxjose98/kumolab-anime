
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
        let status = 'UNKNOWN';
        let detail = '';

        if (!post.image) {
            status = 'NO_IMAGE';
        } else {
            try {
                const res = await fetch(post.image, { method: 'HEAD' });
                if (res.ok) {
                    status = 'OK';
                    detail = `(${res.status})`;
                } else {
                    status = 'BROKEN';
                    detail = `(${res.status})`;
                }
            } catch (e: any) {
                status = 'ERROR';
                detail = `(${e.message})`;
            }
        }

        console.log(`[${status}] ${post.title.substring(0, 50)}... | ${post.image?.substring(0, 50)}...`);
    }
}

checkPendingImages();
