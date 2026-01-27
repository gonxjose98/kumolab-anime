
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deepScan() {
    console.log("--- DEEP SCAN DATABASE ---");
    // Get count
    const { count, error: countError } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true });

    console.log(`Total Rows: ${count}`);

    // Get ALL titles in reverse chronological order
    const { data, error } = await supabase
        .from('posts')
        .select('id, title, created_at, is_published')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Scan Error:", error);
    } else {
        console.log("Recent Posts:");
        data?.forEach(p => {
            console.log(`[${p.created_at}] ${p.title} (Published: ${p.is_published}) ID: ${p.id}`);
        });
    }
}

deepScan();
