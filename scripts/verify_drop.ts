
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDropImage() {
    const ID = '7c92e82d-c11f-49a5-9f77-959b8ff3853d';
    const { data: post } = await supabase.from('posts').select('image').eq('id', ID).single();
    console.log("FINAL IMAGE:", post?.image);
}

verifyDropImage();
