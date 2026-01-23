
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ANILIST_URL = 'https://graphql.anilist.co';

async function fetchImage(title: string) {
    const query = `
        query ($search: String) {
            Media (search: $search, type: ANIME) {
                id
                coverImage { extraLarge large }
                bannerImage
            }
        }
    `;
    try {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title } })
        });
        const json = await response.json();
        const media = json.data?.Media;
        return media?.bannerImage || media?.coverImage?.extraLarge || null;
    } catch (e) { return null; }
}

async function run() {
    console.log("Forcing Image Repair...");

    // Get latest
    const { data: posts } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(1);
    const post = posts?.[0];

    if (!post) {
        console.log("No post found.");
        return;
    }

    console.log(`Fixing post: ${post.title}`);

    // Fetch clean URL
    let newImage = await fetchImage(post.title);
    if (!newImage) {
        const clean = post.title.split(':')[0];
        newImage = await fetchImage(clean);
    }

    if (newImage) {
        console.log(`Updating image to: ${newImage}`);
        const { error } = await supabase.from('posts').update({ image: newImage }).eq('id', post.id);
        if (error) console.error("Error updating:", error);
        else console.log("SUCCESS: Image updated.");
    } else {
        console.error("Could not find a valid image.");
    }
}

run();
