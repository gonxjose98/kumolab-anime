
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { generateIntelPost } from '../src/lib/engine/generator';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Publishing 'Reborn as a Vending Machine Season 3' via Engine Logic...");

    // Simulate what the RSS fetcher would provide
    const simulatedIntel = {
        title: "Reborn as a Vending Machine Season 2 Gets 3rd Season",
        fullTitle: "Reborn as a Vending Machine Season 2 Officially Confirmed for 3rd Season",
        content: "The official staff for the television anime adaptation of Hirukuma's Reborn as a Vending Machine, I Now Wander the Dungeon light novel series has announced that a third season is now in production. The announcement comes with a new teaser visual featuring the main characters.",
        slug: "vending-machine-s3-official-" + Date.now(),
        claimType: 'confirmed',
        image: "C:/Users/Jose G/.gemini/antigravity/brain/0ef14c83-fcc8-4692-9233-f9012698dab7/uploaded_media_1769493548388.jpg",
        imageSearchTerm: "Reborn as a Vending Machine Season 3"
    };

    try {
        console.log("Passing through generateIntelPost...");
        const post = await generateIntelPost([simulatedIntel], new Date());

        if (!post) throw new Error("Generation failed");

        console.log("Post Generated!");
        console.log("Title:", post.title);
        console.log("Image:", post.image);

        if (post.image.includes('fallback') || post.image.includes('hero-bg-final.png')) {
            console.error("FAIL: Fallback image used!");
        }

        console.log("Inserting into database...");
        const { data, error } = await supabase.from('posts').insert({
            title: post.title,
            content: post.content,
            image: post.image,
            slug: post.slug,
            type: post.type,
            is_published: true,
            claim_type: post.claimType,
            created_at: new Date().toISOString()
        }).select();

        if (error) throw error;
        console.log("Success! Post ID:", data[0].id);
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
