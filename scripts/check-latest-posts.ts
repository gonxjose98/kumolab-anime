import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    const { data: posts } = await supabase
        .from('posts')
        .select('title, image, id')
        .order('timestamp', { ascending: false })
        .limit(5);

    console.log("Latest Posts:");
    posts?.forEach(p => {
        console.log(`Title: ${p.title}`);
        console.log(`Image: ${p.image}`);
        console.log(`---`);
    });
}

run();
