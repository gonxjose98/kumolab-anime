
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLatestPostSocials() {
    console.log('Checking latest post social status...');

    // Get the most recent post (assuming it's the one they tried to publish)
    // We order by timestamp descending
    const { data: posts, error } = await supabase
        .from('posts')
        .select('id, title, social_ids, is_published, timestamp')
        .order('timestamp', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    if (!posts || posts.length === 0) {
        console.log('No posts found.');
        return;
    }

    const post = posts[0];
    console.log(`\nLatest Post: "${post.title}" (ID: ${post.id})`);
    console.log(`Published on Site: ${post.is_published}`);

    const socialIds = post.social_ids || {};
    console.log('\nSocial IDs:');
    console.log(`- Twitter (X): ${socialIds.twitter || 'NOT FOUND'}`);
    console.log(`- Facebook: ${socialIds.facebook || 'NOT FOUND'}`);
    console.log(`- Instagram: ${socialIds.instagram || 'NOT FOUND'}`);
    console.log(`- Threads: ${socialIds.threads || 'NOT FOUND'}`);

    // Check specifically if "social_ids" is empty object or null
    if (!post.social_ids || Object.keys(post.social_ids).length === 0) {
        console.log('\nWARNING: No social IDs found. It likely did NOT publish to socials.');
    } else {
        console.log('\nSUCCESS: Social IDs found. It likely published successfully.');
    }
}

checkLatestPostSocials();
