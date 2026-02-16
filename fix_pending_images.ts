
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { selectBestImage } from './src/lib/engine/image-selector';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPendingImages() {
    console.log('Fetching pending posts...');
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    console.log(`Found ${posts?.length} pending posts.\n`);

    for (const post of posts || []) {
        let isBroken = false;
        if (!post.image) {
            isBroken = true;
        } else {
            try {
                const res = await fetch(post.image, { method: 'HEAD' });
                if (!res.ok) isBroken = true;
            } catch (e) {
                isBroken = true;
            }
        }

        if (isBroken) {
            console.log(`Fixing: ${post.title}`);
            // Attempt to find a new image
            const imageResult = await selectBestImage(post.title, 'General');
            if (imageResult) {
                console.log(`   New Image Found: ${imageResult.url}`);
                const { error: updateError } = await supabase
                    .from('posts')
                    .update({
                        image: imageResult.url,
                        origin_image_url: imageResult.url
                    })
                    .eq('id', post.id);

                if (updateError) {
                    console.error(`   Update Error:`, updateError);
                } else {
                    console.log(`   SUCCESS`);
                }
            } else {
                console.log(`   FAILED: No image found even with improved selector.`);
            }
            console.log('---');
        }
    }
}

fixPendingImages();
