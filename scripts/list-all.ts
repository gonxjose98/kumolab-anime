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

async function listAll() {
    const { data: posts } = await supabase.from('posts').select('id, title, slug, type, content, timestamp, is_published').order('timestamp', { ascending: false }).limit(5);
    console.log(`TOTAL POSTS: ${posts?.length}`);
    posts?.forEach(p => {
        const hasLog = p.content.includes('INTERNAL VERIFICATION');
        const hasEmDash = p.content.includes('—');
        console.log(`[${p.type}] (${p.is_published ? 'LIVE' : 'HIDDEN'}) ${p.timestamp} | SLUG: ${p.slug} | TITLE: ${p.title}`);
    });
}

listAll().catch(console.error);

