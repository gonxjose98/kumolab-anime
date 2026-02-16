import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSpecificColumns() {
    const cols = ['status', 'source_tier', 'relevance_score', 'is_duplicate', 'scheduled_post_time'];
    for (const col of cols) {
        const { error } = await supabase.from('posts').select(col).limit(1);
        if (error) {
            console.log(`Column '${col}' DOES NOT exist.`);
        } else {
            console.log(`Column '${col}' EXISTS.`);
        }
    }

    const { error: declinedError } = await supabase.from('declined_posts').select('*').limit(1);
    if (declinedError) {
        console.log("Table 'declined_posts' DOES NOT exist.");
    } else {
        console.log("Table 'declined_posts' EXISTS.");
    }
}

checkSpecificColumns();
