
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';
import { selectBestImage } from '../src/lib/engine/image-selector';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function remediate() {
    console.log('--- KumoLab Remediation Pass ---');

    // 1. Fetch ALL published posts for a total visual overhaul
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('is_published', true);

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log('No posts found matching remediation criteria.');
        return;
    }

    console.log(`Found ${posts.length} posts to remediate.\n`);

    let countRegenerated = 0;
    let countUnpublished = 0;
    let countTotal = posts.length;

    for (const post of posts) {
        console.log(`[Processing] "${post.title}" (ID: ${post.id})`);

        // Clean title for image search
        const searchTerm = post.title.split(' Season')[0].split(':')[0].split(' –')[0].trim();
        console.log(`  - Searching for: "${searchTerm}"`);

        const imageResult = await selectBestImage(searchTerm);

        if (imageResult && imageResult.url && imageResult.url !== '/hero-bg-final.png') {
            console.log(`  - Found candidate: ${imageResult.url}`);

            // Determine text overlay rules
            const isVisual = post.title.toLowerCase().includes('visual') || post.title.toLowerCase().includes('poster');
            const isTrailer = post.title.toLowerCase().includes('trailer') || post.title.toLowerCase().includes('pv');
            const detectedExistingText = imageResult.hasText;
            const applyText = !(isVisual || isTrailer || detectedExistingText);

            if (!applyText) {
                console.log(`  - Visual/Trailer or Existing Text detected. Disabling text overlay.`);
            }

            // Prepare highlight indices for the image processor
            const titleWords = post.title.split(/\s+/).filter(Boolean);
            const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual'];
            const purpleWordIndices: number[] = [];
            titleWords.forEach((word: string, idx: number) => {
                if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
                    purpleWordIndices.push(idx);
                }
            });

            try {
                const result = await generateIntelImage({
                    sourceUrl: imageResult.url,
                    animeTitle: post.title,
                    headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
                    purpleWordIndices,
                    slug: post.slug,
                    applyText,
                    applyGradient: applyText
                });

                if (result && result.processedImage) {
                    console.log(`  - Successfully processed image.`);
                    const { error: updateError } = await supabase
                        .from('posts')
                        .update({
                            image: result.processedImage,
                            is_published: true
                        })
                        .eq('id', post.id);

                    if (updateError) {
                        console.error(`  - Failed to update DB: ${updateError.message}`);
                    } else {
                        console.log(`  - Post updated and published.`);
                        countRegenerated++;
                    }
                } else {
                    console.warn(`  - Image processor failed for unknown reason.`);
                    await unpublish(post);
                    countUnpublished++;
                }
            } catch (err: any) {
                console.error(`  - Error during image processing: ${err.message}`);
                await unpublish(post);
                countUnpublished++;
            }
        } else {
            console.warn(`  - No valid image found for this topic.`);
            await unpublish(post);
            countUnpublished++;
        }
        console.log('---');
    }

    console.log('\n--- Remediation Complete ---');
    console.log(`Total Scanned: ${countTotal}`);
    console.log(`Regenerated:   ${countRegenerated}`);
    console.log(`Unpublished:   ${countUnpublished} (No quality image found)`);
}

async function unpublish(post: any) {
    console.log(`  - Unpublishing post due to lack of quality visual.`);
    const { error } = await supabase
        .from('posts')
        .update({ is_published: false })
        .eq('id', post.id);

    if (error) {
        console.error(`  - Error unpublishing: ${error.message}`);
    }
}

remediate().catch(console.error);
