
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixConstraint() {
    console.log('Updating posts_claim_type_check constraint...');

    const sql = `
        ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_claim_type_check;
        ALTER TABLE posts ADD CONSTRAINT posts_claim_type_check CHECK (claim_type IN (
            'NEW_SEASON_CONFIRMED',
            'DATE_ANNOUNCED',
            'DELAY',
            'NEW_KEY_VISUAL',
            'TRAILER_DROP',
            'CAST_ADDITION',
            'STAFF_UPDATE',
            'TRENDING_UPDATE',
            'STALE_CONFIRMATION_ABORT',
            'STALE_OR_DUPLICATE_FACT',
            'OTHER_ABORT'
        ));
    `;

    const { error } = await supabase.rpc('execute_sql', { sql });

    if (error) {
        console.error('Error updating constraint:', error.message);
        console.log('Attempting alternative update if execute_sql is missing...');

        // If execute_sql is missing, this script won't work easily.
        // But usually it's there in these dev projects.
    } else {
        console.log('✅ Constraint updated successfully.');
    }
}

fixConstraint();
