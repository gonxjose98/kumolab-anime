export {};

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
    const { data: posts } = await supabase.from('posts').select('*').order('timestamp', { ascending: false }).limit(5);

    posts?.forEach(p => {
        console.log(`=== POST: ${p.title} ===`);
        console.log(`ID: ${p.id}`);
        console.log(`SLUG: ${p.slug}`);
        console.log(`TYPE: ${p.type}`);
        console.log(`CONTENT (RAW):`);
        console.log(JSON.stringify(p.content));
        console.log(`HAS — (em dash): ${p.content.includes('—')}`);
        console.log(`HAS - (hyphen): ${p.content.includes('-')}`);
        console.log(`---`);
    });
}

inspect().catch(console.error);

