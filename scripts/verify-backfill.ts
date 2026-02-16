
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { supabaseAdmin } from '../src/lib/supabase/admin';

async function verify() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('title, timestamp, claim_type')
        .order('timestamp', { ascending: false })
        .limit(10);

    if (error) {
        console.error(error);
        return;
    }

    console.log(`--- Recent Publications (Supabase) ---`);
    data.forEach((p, i) => {
        console.log(`${i + 1}. ${p.title} [${p.claim_type}] - ${p.timestamp}`);
    });
}

verify().catch(console.error);
