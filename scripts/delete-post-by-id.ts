
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function deletePostById(id: string) {
    console.log(`Deleting post ID: ${id}...`);
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) {
        console.error("Error deleting post:", error);
    } else {
        console.log("Post deleted successfully.");
    }
}

const id = process.argv[2];
if (!id) {
    console.error("Please provide an ID");
} else {
    deletePostById(id);
}
