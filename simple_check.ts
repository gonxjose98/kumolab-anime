
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    const { data: logs } = await supabase.from('scheduler_logs').select('*').order('timestamp', { ascending: false }).limit(3);
    console.log('--- LOGS ---');
    logs?.forEach(l => console.log(`${l.timestamp} | ${l.status} | ${l.message}`));

    const { data: posts } = await supabase.from('posts').select('title, status, timestamp').order('timestamp', { ascending: false }).limit(3);
    console.log('--- POSTS ---');
    posts?.forEach(p => console.log(`${p.timestamp} | ${p.status} | ${p.title}`));
}

check();
