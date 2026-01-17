import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function findIntel() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, type')
        .eq('type', 'INTEL')
        .limit(1);

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (data && data.length > 0) {
        console.log("FOUND_ID:" + data[0].id);
        console.log("TITLE:" + data[0].title);
    } else {
        console.log("NO_INTEL_FOUND");
    }
}

findIntel();
