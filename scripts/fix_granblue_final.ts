
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixGranblue() {
    const POST_ID = '609e81a4-55a8-4bfe-bc1f-2686223b2565';
    // Clean, high-res official key visual (16:9 4K)
    const TARGET_IMAGE = 'https://image.api.playstation.com/vulcan/ap/rnd/202006/1400/a290h6wGNxdaXldfBBCAAxe8.jpg';

    console.log(`Fixing Granblue post ${POST_ID}...`);

    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', POST_ID)
        .single();

    if (error || !post) {
        console.error("Error fetching post:", error);
        return;
    }

    console.log(`Processing title: ${post.title}`);

    // Generate with TEXT_HEAVY to kill gradient, and bypassSafety for 16:9 crop
    const result = await generateIntelImage({
        sourceUrl: TARGET_IMAGE,
        animeTitle: post.title,
        headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
        slug: post.slug,
        classification: 'TEXT_HEAVY', // CRITICAL: Ensures NO gradient
        applyText: true,
        bypassSafety: true, // Allow 16:9 source
        disableAutoScaling: false
    });

    if (result && result.processedImage) {
        console.log(`Success! New image: ${result.processedImage}`);
        const { error: updateError } = await supabase
            .from('posts')
            .update({ image: result.processedImage })
            .eq('id', POST_ID);

        if (updateError) {
            console.error("Error updating database:", updateError);
        } else {
            console.log("Database updated successfully.");
        }
    } else {
        console.error("Image processing failed.");
    }
}

fixGranblue();
