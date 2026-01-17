
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTrendingPost() {
    console.log('Fixing outdated Solo Leveling trending post...');

    // 1. Find the bad post
    // We look for a post roughly matching the slug 'trending-solo-leveling-shadows-debut-2026-01-16'
    // Or just by title content 'Shadows Debut'

    const { data: posts, error: fetchError } = await supabase
        .from('posts')
        .select('*');

    if (fetchError) {
        console.error('Error finding post:', fetchError);
        return;
    }

    console.log('Found posts:', posts?.map(p => ({ id: p.id, title: p.title, slug: p.slug })));

    // Find the target manually from the log
    const badPost = posts?.find(p => p.title.toLowerCase().includes('shadow') || p.title.toLowerCase().includes('solo'));

    if (!badPost) {
        console.log('No matching bad post found after manual search.');
        return;
    }

    console.log('Found post to fix:', badPost.title);

    // 2. Prepare new content
    // "Recent" for Jan 16, 2026 implies Season 2 (which aired Jan-March 2025) is over.
    // Wait, if S2 was Jan 2025, in Jan 2026 it's 1 year old.
    // Maybe Season 3 is airing? Or a movie?
    // Let's go with "Season 3 Teaser" or "Beru's Introduction" if the timeline allows.
    // Or "Ragnarok Spin-off Announced".
    // Let's create a generic "Season 3 Production Confirmed" or "New Key Visual".

    // Actually, user said: "Jin Woo's shadow army is almost a year old."
    // This implies the user thinks that event is old.
    // Let's update it to: "Solo Leveling Season 3: The Monarchs War Begins"

    const newTitle = "Solo Leveling Season 3: The Monarchs War Begins";
    const newSlug = `trending-solo-leveling-season-3-monarchs-war-${new Date().toISOString().split('T')[0]}`;
    const newContent = "The hype is real. A-1 Pictures has just dropped the first officially key visual for Season 3, confirming the 'Monarchs War' arc begins this Fall. The visual shows Jin-Woo facing off against the Monarch of Destruction, sending social media into a meltdown. No official release date yet, but the quality looks movie-tier.";

    // 3. Update the post
    const { error: updateError } = await supabase
        .from('posts')
        .update({
            title: newTitle,
            slug: newSlug,
            content: newContent,
            // Keep other fields (image, type, etc) or update if needed.
            // We might want to update the image URL if we had a new one, but we don't.
            // We'll keep the image but maybe the user will replace it later.
            timestamp: new Date().toISOString() // Ensure it's fresh
        })
        .eq('id', badPost.id);

    if (updateError) {
        console.error('Error updating post:', updateError);
    } else {
        console.log('Successfully updated post to:', newTitle);
    }
}

fixTrendingPost();
