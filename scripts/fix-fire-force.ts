
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPost() {
    const postId = '1f087290-32c5-45bf-b893-a4539a84c05c';
    const imageUrl = 'https://i.redd.it/ccqogtllqgp31.jpg';

    console.log(`--- Fixing Fire Force Post [${postId}] ---`);

    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

    if (error || !post) {
        console.error('Post not found:', error);
        return;
    }

    // Composition adjustment: Balance the frame with x: 0.42
    // Now re-enabling KumoLab text/gradient for this clean action visual
    const result = await generateIntelImage({
        sourceUrl: imageUrl,
        animeTitle: post.title,
        headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
        purpleWordIndices: [0, 1], // Highlight "Fire Force"
        slug: post.slug,
        applyText: true,
        applyGradient: true,
        applyWatermark: true,
        position: { x: 0.42, y: 0 }
    });

    if (result && result.processedImage) {
        const { error: updateError } = await supabase
            .from('posts')
            .update({ image: result.processedImage })
            .eq('id', postId);

        if (updateError) {
            console.error('Failed to update post:', updateError);
        } else {
            console.log('Successfully updated Fire Force post with new centering and rule-compliant rendering.');
        }
    } else {
        console.error('Processing failed.');
    }
}

fixPost().catch(console.error);
