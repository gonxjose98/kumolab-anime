
import { fetchOfficialAnimeImages } from '../src/lib/engine/fetchers';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function regenerateFrieren() {
    const postTitle = "Frieren: Beyond Journey's End Season 2 Confirmed";
    const animeName = "Frieren: Beyond Journey's End";

    console.log(`Regenerating post: ${postTitle}`);

    // 1. Find the post
    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', `%Frieren%Season 2%Confirmed%`)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (error || !post) {
        console.error("Frieren post not found in DB.");
        return;
    }

    console.log(`Found post with current image: ${post.image}`);

    // 2. Fetch official images
    const images = await fetchOfficialAnimeImages(animeName);
    console.log(`Found ${images.length} images:`, images);

    if (images.length < 2) {
        console.error("Not enough images found to guarantee a change.");
        return;
    }

    // Pick the second one for variety
    const newImageUrl = images[1];
    console.log(`Selected new image URL: ${newImageUrl}`);

    // 4. Run reprocess
    const { generateIntelImage } = await import('../src/lib/engine/image-processor');

    const titleWords = post.title.split(/\s+/).filter(Boolean);
    const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual', 'episode'];
    const purpleWordIndices: number[] = [];
    titleWords.forEach((word: any, idx: number) => {
        if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
            purpleWordIndices.push(idx);
        }
    });

    // Create a slightly unique slug/ID suffix to avoid overwriting based on identical slug if processing cache is used
    const uniqueSuffix = `-${Date.now().toString().slice(-4)}`;

    const result = await generateIntelImage({
        sourceUrl: newImageUrl,
        animeTitle: post.title,
        headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
        purpleWordIndices,
        slug: post.slug + uniqueSuffix,
        classification: 'CLEAN',
        applyText: true
    });

    if (result && result.processedImage) {
        console.log(`Success! New image: ${result.processedImage}`);
        const { error: updateError } = await supabase
            .from('posts')
            .update({ image: result.processedImage })
            .eq('id', post.id);

        if (updateError) {
            console.error("Error updating database:", updateError);
        } else {
            console.log("Database updated successfully.");
        }
    } else {
        console.error("Image processing failed.");
    }
}

regenerateFrieren();
