
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkColumns() {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching posts:", error);
    } else if (data && data.length > 0) {
        console.log("Columns found in 'posts' table:", Object.keys(data[0]));
    } else {
        console.log("No posts found to check columns.");
        // Try to insert a dummy row to see what fails? No.
        // Try to select a specific column
        const { error: colError } = await supabase.from('posts').select('truth_fingerprint').limit(1);
        if (colError) {
            console.log("Column 'truth_fingerprint' DOES NOT exist.");
        } else {
            console.log("Column 'truth_fingerprint' exists.");
        }
    }
}

checkColumns();
