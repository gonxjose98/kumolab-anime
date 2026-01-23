
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (posts && posts[0]) {
        const post = posts[0];
        // Proposed cleaner title
        const newTitle = "Demon Slayer: Yoshiwara in Flames Reveals Character Enkaku";

        console.log(`Renaming: "${post.title}" -> "${newTitle}"`);

        const { error } = await supabase
            .from('posts')
            .update({ title: newTitle })
            .eq('id', post.id);

        if (!error) console.log("✅ Title Refined.");
        else console.error("Error:", error);
    }
}

run();
