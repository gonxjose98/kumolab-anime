
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load ENV
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteByTitleKeyword(keyword: string) {
    if (!keyword) {
        console.error("No keyword provided");
        return;
    }
    console.log(`Searching for posts with title containing: "${keyword}"...`);

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', `%${keyword}%`);

    if (error) {
        console.error("Search error:", error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log("No posts found.");
        return;
    }

    for (const post of posts) {
        console.log(`Deleting: ${post.title} (${post.slug})`);
        const { error: delError } = await supabase
            .from('posts')
            .delete()
            .eq('id', post.id);

        if (delError) console.error("Delete failed:", delError);
        else console.log("Deleted successfully.");
    }
}

const keyword = process.argv[2];
deleteByTitleKeyword(keyword);
