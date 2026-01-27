
import { createClient } from '@supabase/supabase-js';
import { generateIntelImage } from '../src/lib/engine/image-processor';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function createWistoria() {
    console.log("Creating Wistoria Post...");

    const title = "'Wistoria: Wand and Sword' Season 2 Confirmed for April 2026";
    const slug = "wistoria-season-2-confirmed-april-2026";
    // Using the user's specific uploaded image if possible, or the verified fallback
    // The user uploaded: uploaded_media_1769480013320.jpg
    // Let's assume we use the official high-res banner we verified earlier as it's cleaner for generation
    const sourceUrl = 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/174576-6stJnscy5rCi.jpg';

    // 1. Generate Image
    const imageBase64 = await generateIntelImage({
        sourceUrl,
        animeTitle: title,
        headline: "SEASON 2 CONFIRMED",
        slug,
        skipUpload: true,
        applyText: true,
        applyGradient: true,
        applyWatermark: true,
        purpleWordIndices: [0, 1] // Highlights 'Wistoria'
    });

    if (!imageBase64) {
        console.error("Failed to generate image");
        return;
    }

    // 2. Upload to Storage
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    const fileName = `generated-${slug}.png`;

    // Upload
    const { error: uploadError } = await supabaseAdmin
        .storage
        .from('blog-images')
        .upload(fileName, buffer, {
            contentType: 'image/png',
            upsert: true
        });

    if (uploadError) {
        console.error("Upload Error:", uploadError);
        // Continue?
    }

    const { data: { publicUrl } } = supabaseAdmin
        .storage
        .from('blog-images')
        .getPublicUrl(fileName);

    console.log("Image URL:", publicUrl);

    // 3. Insert Post
    const { data, error } = await supabaseAdmin
        .from('posts')
        .insert([{
            title,
            slug,
            type: 'INTEL',
            content: "The second season of 'Wistoria: Wand and Sword' has been officially confirmed for an April 2026 premiere. The announcement was accompanied by a new key visual featuring Will Serfort.\n\nMore information is expected closer to release.",
            image: publicUrl,
            timestamp: new Date().toISOString(),
            is_published: true, // AUTO PUBLISH
            claim_type: 'confirmed',
            premiere_date: '2026-04-01' // Approx
        }])
        .select();

    if (error) {
        console.error("DB Insert Error:", error);
    } else {
        console.log("Post Created Successfully:", data[0].id);
    }
}

createWistoria();
