
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

async function searchWand() {
    const { data } = await supabase
        .from('posts')
        .select('id, title, image')
        .ilike('title', '%Wand%')
        .limit(10);

    console.log(JSON.stringify(data, null, 2));

    // Also check for Japanese or other likely keywords if the user says "Wistoria"
    const { data: d2 } = await supabase
        .from('posts')
        .select('id, title, image')
        .ilike('title', '%Wistoria%')
        .limit(10);
    console.log("Wistoria direct:", JSON.stringify(d2, null, 2));
}

searchWand();
