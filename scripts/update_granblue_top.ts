
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateGranblueTop() {
    const POST_ID = '609e81a4-55a8-4bfe-bc1f-2686223b2565';
    // Use the PS Store Vertical Art
    const IMAGE_URL = 'https://image.api.playstation.com/vulcan/ap/rnd/202006/1400/a290h6wGNxdaXldfBBCAAxe8.jpg';

    console.log(`Updating Granblue Post ${POST_ID} with Top Gradient...`);

    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', POST_ID)
        .single();

    if (error) return console.error(error);

    // Calculate purple words
    const titleWords = post.title.split(/\s+/).filter(Boolean);
    const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual', 'episode', 'relink'];
    const purpleWordIndices: number[] = [];
    titleWords.forEach((word: string, idx: number) => {
        if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
            purpleWordIndices.push(idx);
        }
    });

    // TOP TEXT & TOP GRADIENT
    const result = await generateIntelImage({
        sourceUrl: IMAGE_URL,
        animeTitle: post.title,
        headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
        purpleWordIndices,
        slug: post.slug,
        applyText: true,

        applyGradient: true,      // FORCE Gradient ON
        gradientPosition: 'top',  // FORCE Gradient Top
        textPosition: { x: 540, y: 300 }, // Position text at top

        classification: 'TEXT_HEAVY', // Keep classification but override gradient via explicit prop
        bypassSafety: true            // Allow 16:9 source crop
    });

    if (result && result.processedImage) {
        console.log(`Success! New Granblue Image: ${result.processedImage}`);
        await supabase.from('posts').update({ image: result.processedImage }).eq('id', POST_ID);
        console.log("DB Updated.");
    }
}

updateGranblueTop();
