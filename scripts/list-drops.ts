
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

async function list() {
    const { data: posts, error } = await supabase
        .from('posts')
        .select('id, title, slug, content')
        .eq('type', 'DROP')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${posts?.length} drop posts.`);
    posts?.forEach(p => {
        console.log(`ID: ${p.id} | TITLE: ${p.title} | SLUG: ${p.slug}`);
        console.log(`CONTENT PREVIEW: ${p.content.substring(0, 100)}...`);
        console.log(`HAS AUDIT LOG: ${p.content.includes('INTERNAL VERIFICATION')}`);
        console.log('---');
    });
}

list().catch(console.error);
