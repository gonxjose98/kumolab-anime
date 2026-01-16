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

async function wipeAll() {
    console.log('--- WIPING ALL POSTS FOR CLEAN REGEN ---');
    const { error } = await supabase.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(error);
    else console.log('Successfully wiped Supabase posts.');
}

wipeAll().catch(console.error);

