
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';
import { selectBestImage } from '../src/lib/engine/image-selector';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function reprocessPost(id: string, customImageUrl?: string) {
    console.log(`Reprocessing post ID: ${id}...`);

    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !post) {
        console.error("Error fetching post:", error);
        return;
    }

    console.log(`Found post: ${post.title}`);

    let sourceImage = customImageUrl;
    let classification: 'CLEAN' | 'TEXT_HEAVY' | undefined = undefined;

    if (!sourceImage) {
        // Try to find image with a cleaner title
        const seriesName = post.title.split(' Season')[0].split(':')[0].split(' –')[0].trim();
        console.log(`Searching for image for series: ${seriesName}`);
        const imageResult = await selectBestImage(seriesName);
        sourceImage = imageResult?.url;
        classification = imageResult?.classification;
    }

    if (!sourceImage || sourceImage === '/hero-bg-final.png') {
        console.error("Could not find a valid image to process.");
        return;
    }

    console.log(`[Reprocess] Target Image: ${sourceImage}`);
    console.log(`[Reprocess] Target Title: ${post.title}`);

    const titleWords = post.title.split(/\s+/).filter(Boolean);
    const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual', 'episode'];
    const purpleWordIndices: number[] = [];
    titleWords.forEach((word: string, idx: number) => {
        if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
            purpleWordIndices.push(idx);
        }
    });

    const result = await generateIntelImage({
        sourceUrl: sourceImage,
        animeTitle: post.title,
        headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
        purpleWordIndices,
        slug: post.slug,
        classification,
        applyText: true
    });

    if (result && result.processedImage) {
        console.log(`Success! New image: ${result.processedImage}`);
        const { error: updateError } = await supabase
            .from('posts')
            .update({ image: result.processedImage })
            .eq('id', id);

        if (updateError) {
            console.error("Error updating database:", updateError);
        } else {
            console.log("Database updated successfully.");
        }
    } else {
        console.error("Image processing failed.");
    }
}

const id = process.argv[2];
const customUrl = process.argv[3];
if (!id) {
    console.error("Please provide an ID");
} else {
    reprocessPost(id, customUrl);
}
