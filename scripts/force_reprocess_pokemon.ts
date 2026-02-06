
import { generateIntelImage } from '../src/lib/engine/image-processor';
import fs from 'fs';
import { createCanvas } from '@napi-rs/canvas';

async function forceReprocess() {
    console.log("Forcing reprocess for Pokémon Horizons with generated background...");

    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 1350);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1350);

    // Add a simple center circle for "art"
    ctx.fillStyle = '#0f3460';
    ctx.beginPath();
    ctx.arc(540, 675, 400, 0, Math.PI * 2);
    ctx.fill();

    const dataUrl = canvas.toDataURL();

    const result = await generateIntelImage({
        sourceUrl: dataUrl,
        animeTitle: "Pokémon Horizons",
        headline: "Season 3 Confirmed",
        slug: "pokemon-new-rules",
        classification: "CLEAN",
        applyText: true,
        skipUpload: false // We want it uploaded!
    });

    if (result && result.processedImage) {
        console.log("Image reprocessed and uploaded!");

        const { createClient } = await import('@supabase/supabase-js');
        const dotenv = await import('dotenv');
        const path = await import('path');
        dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from('posts')
            .update({ image: result.processedImage })
            .eq('id', '7c898bd4-a964-4fc5-9f6b-97bd056b5245');

        if (error) {
            console.error("Database error:", error);
        } else {
            console.log("Database updated successfully for Pokémon Horizons.");
        }
    } else {
        console.log("Failed.");
    }
}

forceReprocess();
