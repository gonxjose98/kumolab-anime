
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findWistoriaPost() {
    console.log('Searching for Wistoria posts...');

    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', '%Wistoria%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log(`Found ${data.length} post(s):`);
        data.forEach(post => {
            console.log(post);
        });
    } else {
        console.log('No Wistoria posts found.');
    }
}

findWistoriaPost();
