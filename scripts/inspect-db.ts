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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: posts } = await supabase.from('posts').select('*').order('timestamp', { ascending: false }).limit(10);

    console.log(`Found ${posts?.length} posts.`);

    posts?.forEach(p => {
        console.log(`=== POST: ${p.title} ===`);
        console.log(`ID: ${p.id}`);
        console.log(`TYPE: ${p.type}`);
        console.log(`IMAGE: ${p.image}`); // Checking this specifically
        console.log(`CONTENT (Snippet): ${p.content?.substring(0, 50)}...`);
        console.log(`---`);
    });
}

inspect().catch(console.error);
