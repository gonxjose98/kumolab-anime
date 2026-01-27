
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';
import { fetchOfficialAnimeImage } from '../src/lib/engine/fetchers';

// Setup Env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function regenerateWistoria() {
    console.log(`\n--- Regenerating Wistoria Post ---`);

    // 1. Find Post
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', '%Wistoria%')
        .limit(1);

    if (error || !posts || posts.length === 0) {
        console.error("Post not found.");
        return;
    }

    const post = posts[0];
    console.log(`Found Post: ${post.title} (${post.id})`);

    // 2. Use User-Provided Image
    const sourceUrl = `C:/Users/Jose G/.gemini/antigravity/brain/0ef14c83-fcc8-4692-9233-f9012698dab7/uploaded_media_1769490957961.jpg`;
    console.log(`Using specific provided image: ${sourceUrl}`);

    // 3. Generate New Image
    console.log("Generating Intel Image...");
    const newImageUrl = await generateIntelImage({
        sourceUrl,
        animeTitle: "Wistoria: Wand and Sword",
        headline: "SEASON 2 CONFIRMED",
        slug: (post.slug || 'wistoria-season-2') + '-' + Date.now(),
        applyText: true,
        applyGradient: true,
        applyWatermark: true,
        purpleWordIndices: [0], // Highlight "Wistoria"
        // Ensure scale fits nicely (cover height)
        scale: 1,
        position: { x: 0, y: 0 }
    });

    if (newImageUrl) {
        console.log(`New Image Generated: ${newImageUrl}`);

        // 4. Update DB
        const { error: updateError } = await supabase
            .from('posts')
            .update({ image: newImageUrl })
            .eq('id', post.id);

        if (updateError) {
            console.error("DB Update Failed:", updateError);
        } else {
            console.log("DB Updated Successfully!");
        }
    } else {
        console.error("Image Generation Failed.");
    }
}

regenerateWistoria();
