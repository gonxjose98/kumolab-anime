
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTiers() {
    const { data, error } = await supabase
        .from('posts')
        .select('id, title, source, source_tier, relevance_score')
        .eq('status', 'pending');

    if (error) {
        console.error('Error fetching posts:', error);
        return;
    }

    console.log('--- Pending Posts Tiers ---');
    data?.forEach(p => {
        console.log(`Title: ${p.title} | Source: ${p.source} | Tier: ${p.source_tier} | Score: ${p.relevance_score}`);
    });
}

checkTiers();
