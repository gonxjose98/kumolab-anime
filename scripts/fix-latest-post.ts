
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ANILIST_URL = 'https://graphql.anilist.co';

async function fetchImage(term: string) {
    if (!term) return null;
    console.log(`Searching AniList for: "${term}"`);
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
            body: JSON.stringify({ query, variables: { search: term } })
        });
        const json = await response.json();
        const media = json.data?.Media;
        return media?.bannerImage || media?.coverImage?.extraLarge || null;
    } catch (e) { return null; }
}

async function run() {
    const { data: posts } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(1);
    const post = posts?.[0];

    if (!post) return;

    console.log(`Current Title: "${post.title}"`);

    // Strategy 1: Title
    let newImage = await fetchImage(post.title);

    // Strategy 2: Context keywords if failed
    if (!newImage) {
        if (post.content.includes("Yoshiwara") || post.content.includes("Demon Slayer")) {
            newImage = await fetchImage("Demon Slayer: Kimetsu no Yaiba");
        }
    }

    // Strategy 3: Hardcoded fallback for known failures
    if (!newImage && post.title.includes("Enkaku")) {
        newImage = await fetchImage("Demon Slayer");
    }

    if (newImage) {
        console.log(`Found: ${newImage}`);
        await supabase.from('posts').update({ image: newImage }).eq('id', post.id);
        console.log("Updated.");
    } else {
        console.log("Still no image found. Applying static fallback.");
        await supabase.from('posts').update({ image: '/hero-bg-final.png' }).eq('id', post.id);
    }
}

run();
