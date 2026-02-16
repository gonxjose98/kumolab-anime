
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { getSourceTier, calculateRelevanceScore } from '../src/lib/engine/utils';
import { selectBestImage } from '../src/lib/engine/image-selector';
import { generateIntelImage } from '../src/lib/engine/image-processor';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function remediate() {
    console.log('--- Post Remediation Started ---');

    // 1. Fetch All Pending Posts
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'pending');

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    console.log(`Found ${posts?.length || 0} pending posts to review.`);

    for (const post of (posts || [])) {
        let needsUpdate = false;
        const updates: any = {};

        // A. Fix Tier Assignment
        const newTier = await getSourceTier(post.source || 'Unknown', supabase);
        if (newTier !== post.source_tier) {
            console.log(`[Tier Fix] "${post.title}": ${post.source_tier} -> ${newTier}`);
            updates.source_tier = newTier;
            updates.relevance_score = calculateRelevanceScore({ title: post.title, source_tier: newTier });
            needsUpdate = true;
        }

        // B. Fix "Iron Wok Jan!" Image (And any other cityscape fallbacks)
        const isIronWok = post.title.toLowerCase().includes('iron wok jan');
        const isFallback = post.image && (post.image.includes('hero-bg-final.png') || post.image.includes('cityscape'));

        if (isIronWok || isFallback) {
            console.log(`[Image Regen] Attempting regeneration for: "${post.title}"`);
            const imageResult = await selectBestImage(post.title);
            if (imageResult && !imageResult.url.includes('hero-bg-final.png')) {
                const processed = await generateIntelImage({
                    sourceUrl: imageResult.url,
                    animeTitle: post.title,
                    headline: '',
                    slug: post.slug,
                    classification: imageResult.classification,
                    applyText: imageResult.classification === 'CLEAN',
                    applyGradient: imageResult.classification === 'CLEAN'
                });

                if (processed?.processedImage) {
                    updates.image = processed.processedImage;
                    updates.origin_image_url = imageResult.url;
                    needsUpdate = true;
                    console.log(`[Image Regen] SUCCESS for "${post.title}"`);
                }
            } else {
                console.log(`[Image Regen] SKIP: No better image found for "${post.title}"`);
            }
        }

        if (needsUpdate) {
            const { error: updateError } = await supabase
                .from('posts')
                .update(updates)
                .eq('id', post.id);

            if (updateError) {
                console.error(`Error updating post ${post.id}:`, updateError);
            }
        }
    }

    console.log('--- Post Remediation Complete ---');
}

remediate();
