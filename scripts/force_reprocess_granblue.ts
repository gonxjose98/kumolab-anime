
import { generateIntelImage } from '../src/lib/engine/image-processor';
import { createCanvas } from '@napi-rs/canvas';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function fixGranblue() {
    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(100, 100, 880, 1150); // A "poster" in the middle

    const dataUrl = canvas.toDataURL();
    console.log("Generated 4:5 Data URL for Granblue");

    const result = await generateIntelImage({
        sourceUrl: dataUrl,
        animeTitle: "Granblue Fantasy: Relink",
        headline: "Endless Ragnarok Version",
        slug: "granblue-fix",
        classification: "TEXT_HEAVY", // Hard lock this
        applyText: true,
        skipUpload: false
    });

    if (result && result.processedImage) {
        console.log("Success! Image URL:", result.processedImage);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from('posts')
            .update({ image: result.processedImage })
            .eq('id', 'c1c810bc-b47a-43fd-898b-66533396e3f6');

        if (error) console.error(error);
        else console.log("Database updated for Granblue.");
    } else {
        console.log("Failed.");
    }
}

fixGranblue();
