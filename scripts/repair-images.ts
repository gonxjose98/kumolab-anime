export { };

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must use Service Role for Updates
const supabase = createClient(supabaseUrl, supabaseKey);

async function repair() {
    console.log('Checking for posts with missing images...');

    const { data: posts, error } = await supabase
        .from('posts')
        .select('id, title, image')
        .is('image', null);

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log('All posts have images. No repair needed.');
        return;
    }

    console.log(`Found ${posts.length} posts without images. Repairing...`);

    for (const post of posts) {
        console.log(`Fixing: ${post.title} (${post.id})`);

        const { error: updateError } = await supabase
            .from('posts')
            .update({ image: '/hero-bg-final.png' })
            .eq('id', post.id);

        if (updateError) {
            console.error(`Failed to update ${post.id}:`, updateError);
        } else {
            console.log(`-> Repaired.`);
        }
    }
}

repair().catch(console.error);
