
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

async function checkWistoria() {
    console.log("Checking for Wistoria post...");

    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', '%Wistoria%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error:", error);
    } else {
        if (data && data.length > 0) {
            console.log("Found Wistoria Post(s):");
            data.forEach(p => {
                console.log(`- [${p.id}] ${p.title}`);
                console.log(`  Pub: ${p.is_published}, Type: ${p.type}`);
                console.log(`  Img: ${p.image}`);
                console.log(`  Date: ${p.created_at}`);
            });
        } else {
            console.log("No Wistoria post found in database.");
        }
    }
}

checkWistoria();
