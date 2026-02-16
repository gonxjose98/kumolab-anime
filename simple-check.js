const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log('Querying...');
    try {
        const { data: run } = await supabase.from('scheduler_runs').select('*').order('run_at', { ascending: false }).limit(1);
        console.log('Last Run:', run?.[0]?.run_at || 'Never');

        const { count } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        console.log('Pending Count:', count || 0);
    } catch (e) {
        console.error('Check failed:', e.message);
    }
}

check();
