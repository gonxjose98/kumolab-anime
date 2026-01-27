
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

async function findPostsClean() {
    const { data, error } = await supabase
        .from('posts')
        .select('id, title, image')
        .order('timestamp', { ascending: false })
        .limit(50);

    if (data) {
        const targets = data.filter(p => p.title.toLowerCase().includes('wistoria') || p.title.toLowerCase().includes('vending'));
        console.log(JSON.stringify(targets, null, 2));
    }
}

findPostsClean();
