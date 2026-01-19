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
        .select('title, type, timestamp, image')
        .eq('type', 'TRENDING')
        .order('timestamp', { ascending: false })
        .limit(5);

    console.log("Latest TRENDING Posts:");
    posts?.forEach(p => {
        console.log(`[${p.timestamp}] ${p.title} (Image: ${p.image})`);
    });
}

run();
