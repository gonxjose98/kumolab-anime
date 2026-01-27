
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

async function findSpecificPosts() {

    // 1. Vending Machine
    const { data: vending, error: vErr } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', '%Vending Machine%')
        .limit(1);

    if (vending && vending.length > 0) {
        console.log("--- FOUND VENDING MACHINE ---");
        console.log(JSON.stringify(vending[0], null, 2));
    } else {
        console.log("--- VENDING MACHINE NOT FOUND ---");
    }

    // 2. Wistoria
    const { data: wistoria, error: wErr } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', '%Wistoria%')
        .limit(1);

    if (wistoria && wistoria.length > 0) {
        console.log("--- FOUND WISTORIA ---");
        console.log(JSON.stringify(wistoria[0], null, 2));
    } else {
        console.log("--- WISTORIA NOT FOUND ---");
        // Try alternate spelling or search? "Wand and Sword"?
        const { data: alt, error: aErr } = await supabase
            .from('posts')
            .select('*')
            .ilike('title', '%Wand and Sword%')
            .limit(1);
        if (alt && alt.length > 0) {
            console.log("--- FOUND WISTORIA (ALT) ---");
            console.log(JSON.stringify(alt[0], null, 2));
        }
    }
}

findSpecificPosts();
