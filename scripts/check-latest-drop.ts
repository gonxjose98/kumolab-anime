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

async function check() {
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .eq('type', 'DROP')
        .order('timestamp', { ascending: false })
        .limit(1);

    if (error) {
        console.error(error);
        return;
    }

    if (posts && posts.length > 0) {
        console.log('--- LATEST DROP CONTENT ---');
        console.log(posts[0].content);
        console.log('--- AUDIT DATA ---');
        console.log(JSON.stringify(posts[0].verification_sources, null, 2));
    }
}

check().catch(console.error);

