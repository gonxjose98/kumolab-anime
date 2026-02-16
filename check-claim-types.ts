
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkClaimTypes() {
    const { data, error } = await supabase
        .from('posts')
        .select('claim_type');

    if (error) {
        console.error("Error fetching claim types:", error);
        return;
    }

    const types = new Set(data.map(r => r.claim_type).filter(Boolean));
    console.log("Existing claim_type values in DB:", Array.from(types));
}

checkClaimTypes();
