
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

async function findPosts() {
    console.log("Searching for Wistoria and Vending Machine posts...");

    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .or('title.ilike.%Wistoria%,title.ilike.%Vending Machine%');

    if (error) {
        console.error("Error searching:", error);
        return;
    }

    if (data && data.length > 0) {
        data.forEach(p => {
            console.log(`\nFound Post:`);
            console.log(`ID: ${p.id}`);
            console.log(`Title: ${p.title}`);
            console.log(`Slug: ${p.slug}`);
            console.log(`Current Image: ${p.image}`);
            console.log(`Timestamp: ${p.timestamp}`);
        });
    } else {
        console.log("No posts found matching criteria.");
    }
}

findPosts();
