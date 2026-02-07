
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function revertPokemon() {
    const POST_ID = '7c898bd4-a964-4fc5-9f6b-97bd056b5245';
    const IMAGE_URL = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/158871-jKfsW5HCGA3K.jpg";

    console.log(`Reverting Pokemon Post ${POST_ID}...`);

    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', POST_ID)
        .single();

    if (error) return console.error(error);

    // Calculate purple words
    const titleWords = post.title.split(/\s+/).filter(Boolean);
    const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual', 'episode'];
    const purpleWordIndices: number[] = [];
    titleWords.forEach((word: string, idx: number) => {
        if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
            purpleWordIndices.push(idx);
        }
    });

    // STANDARD DEFAULT GENERATION (Bottom Text, Bottom Gradient)
    const result = await generateIntelImage({
        sourceUrl: IMAGE_URL,
        animeTitle: post.title,
        headline: post.type === 'TRENDING' ? 'TRENDING' : 'INTEL',
        purpleWordIndices,
        slug: post.slug,
        applyText: true,
        // No explicit position = Default Bottom
        // No explicit gradient = Default Rules (On for text)
        bypassSafety: true
    });

    if (result && result.processedImage) {
        console.log(`Success! Reverted Image: ${result.processedImage}`);
        await supabase.from('posts').update({ image: result.processedImage }).eq('id', POST_ID);
        console.log("DB Updated.");
    }
}

revertPokemon();
