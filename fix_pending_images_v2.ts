
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { selectBestImage } from './src/lib/engine/image-selector';
import { generateIntelImage } from './src/lib/engine/image-processor';
import { randomUUID } from 'crypto';

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
            console.log(`   Current Image: ${post.image}`);

            // 1. Attempt to find a new image
            const imageResult = await selectBestImage(post.title, 'General');
            let finalImageUrl = '/hero-bg-final.png';
            let classification: 'CLEAN' | 'TEXT_HEAVY' = 'CLEAN';

            if (imageResult) {
                console.log(`   New Base Image: ${imageResult.url}`);
                finalImageUrl = imageResult.url;
                classification = imageResult.classification;
            } else {
                console.log(`   No new image found, using branded fallback.`);
            }

            // 2. Generate Premium Version
            if (finalImageUrl !== '/hero-bg-final.png' && !finalImageUrl.startsWith('data:')) {
                console.log(`   Regenerating with KumoLab branding...`);
                try {
                    const result = await generateIntelImage({
                        sourceUrl: finalImageUrl,
                        animeTitle: post.title,
                        headline: '',
                        slug: post.slug || `fix-${randomUUID().substring(0, 8)}`,
                        classification: classification,
                        applyText: classification === 'CLEAN',
                        applyGradient: classification === 'CLEAN'
                    });
                    if (result?.processedImage) {
                        finalImageUrl = result.processedImage;
                        console.log(`   Premium Version Generated.`);
                    }
                } catch (e: any) {
                    console.error(`   Processing Error: ${e.message}`);
                }
            }

            // 3. Update Database
            const { error: updateError } = await supabase
                .from('posts')
                .update({
                    image: finalImageUrl
                })
                .eq('id', post.id);

            if (updateError) {
                console.error(`   Update Error:`, updateError);
            } else {
                console.log(`   SUCCESS: ${finalImageUrl.substring(0, 50)}...`);
            }
            console.log('---');
        }
    }
}

fixPendingImages();
