
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

async function listBucket() {
    console.log("Listing bucket 'blog-images'...");

    // List recent files (limit is usually 100)
    const { data, error } = await supabase
        .storage
        .from('blog-images')
        .list('', { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
        console.error("Bucket Error:", error);
        return;
    }

    if (data) {
        data.forEach(f => {
            console.log(`${f.name} (${f.metadata?.mimetype}) - ${(f.metadata as any)?.size} bytes`);
        });
    }
}

listBucket();
