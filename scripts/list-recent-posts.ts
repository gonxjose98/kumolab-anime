
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

async function listRecentPosts() {
    console.log("Listing last 20 posts to find Wistoria...");

    const { data, error } = await supabase
        .from('posts')
        .select('id, title, timestamp')
        .order('timestamp', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error searching:", error);
        return;
    }

    if (data && data.length > 0) {
        data.forEach(p => {
            console.log(`\nTITLE: ${p.title}`);
            console.log(`ID: ${p.id}`);
            console.log(`DATE: ${p.timestamp}`);
        });
    }
}

listRecentPosts();
