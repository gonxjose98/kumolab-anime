
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

import { generateIntelImage } from '../src/lib/engine/image-processor';
import { supabase } from '../src/lib/supabase/client';

async function generateVendingMachineS3() {
    console.log("Generating Reborn as a Vending Machine Season 3 Post...");

    const title = "REBORN AS A VENDING MACHINE SEASON 3";
    const headline = "3RD SEASON OFFICIALLY CONFIRMED";
    const slug = "vending-machine-s3-confirmed-" + Date.now();

    // Use a high quality official banner
    const imageUrl = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/153360-j6Qn3rG7G7z8.jpg";

    try {
        console.log("Creating image...");
        const resultUrl = await generateIntelImage({
            sourceUrl: imageUrl,
            animeTitle: title,
            headline: headline,
            slug: slug
        });

        if (!resultUrl) throw new Error("Image generation failed");

        console.log("Saving to Supabase...");
        const { data, error } = await supabase.from('posts').insert({
            title: title,
            headline: headline,
            content: "The official staff for the television anime of Hirukuma's Reborn as a Vending Machine, I Now Wander the Dungeon light novel series announced that a third season has been green-lit. More details to come.",
            image_url: resultUrl,
            slug: slug,
            category: 'News',
            status: 'published',
            author: 'KumoLab AI',
            created_at: new Date().toISOString()
        }).select();

        if (error) throw error;
        console.log("Success! Post created:", data[0].id);
    } catch (e) {
        console.error("Failed:", e);
    }
}

generateVendingMachineS3();
