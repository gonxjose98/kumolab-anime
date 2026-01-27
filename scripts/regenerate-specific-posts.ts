
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { generateIntelImage } from '../src/lib/engine/image-processor';
import { selectBestImage } from '../src/lib/engine/image-selector';

// Setup Env
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
const supabase = createClient(supabaseUrl, supabaseKey);

async function regeneratePost(partialTitle: string, searchTerm: string) {
    console.log(`\n--- Processing: ${partialTitle} ---`);

    // 1. Find Post
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', `%${partialTitle}%`)
        .limit(1);

    if (error || !posts || posts.length === 0) {
        console.error("Post not found:", partialTitle);
        // Fallback: Try searching for "Anime" + title just in case
        return;
    }

    const post = posts[0];
    console.log(`Found Post: ${post.title} (${post.id})`);

    // 2. Fetch Fresh Source Image using SMART SELECTOR
    console.log(`Fetching fresh source for: ${searchTerm}`);
    const sourceUrl = await selectBestImage(searchTerm);

    if (!sourceUrl) {
        console.error("Failed to find valid image candidate.");
        return;
    }
    console.log(`Source URL: ${sourceUrl}`);

    // 3. Generate New Image (With Watermark & New Gradient)
    console.log("Generating Intel Image...");
    const newImageUrl = await generateIntelImage({
        sourceUrl,
        animeTitle: post.title,
        headline: '', // Assuming standard layout, title is enough
        slug: post.slug,
        applyText: true,
        applyWatermark: true,
        scale: 0.85, // Zoom out to fit more of the character
        position: { x: 0, y: 0.05 }, // Center adjustment
        purpleWordIndices: [0, 1] // Matches title style
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

async function main() {
    await regeneratePost('Golden Kamuy', 'Golden Kamuy');
}

main();
