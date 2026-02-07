
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findGranblue() {
    const { data, error } = await supabase
        .from('posts')
        .select('id, title')
        .ilike('title', '%Granblue%');

    if (error) {
        console.error("Error finding post:", error);
    } else {
        data.forEach(p => console.log(p.id));
    }
}

findGranblue();
