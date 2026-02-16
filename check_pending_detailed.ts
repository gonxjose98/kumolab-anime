
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    console.log('--- PENDING POSTS ---');
    const { data: pending, error: pError } = await supabase
        .from('posts')
        .select('title, status, timestamp, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (pError) console.error(pError);
    else pending?.forEach(p => console.log(`${p.created_at} | ${p.status} | ${p.title}`));

    console.log('\n--- RECENT LOGS ---');
    const { data: logs, error: lError } = await supabase
        .from('scheduler_logs')
        .select('timestamp, status, message')
        .order('timestamp', { ascending: false })
        .limit(3);

    if (lError) console.error(lError);
    else logs?.forEach(l => console.log(`${l.timestamp} | ${l.status} | ${l.message}`));
}

check();
