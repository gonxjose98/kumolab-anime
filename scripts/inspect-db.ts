
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
    const { data, error } = await supabase
        .from('posts')
        .select('id, title, type, content')
        .eq('type', 'CONFIRMATION_ALERT')
        .order('created_at', { ascending: false });

    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

// const id = process.argv[2];
inspect();
