
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function forceFallback() {
    console.log('Forcing all pending posts to use /hero-bg-final.png...');
    const { data, error } = await supabase
        .from('posts')
        .update({ image: '/hero-bg-final.png' })
        .eq('status', 'pending');

    if (error) {
        console.error('Error updating posts:', error);
    } else {
        console.log('Successfully updated all pending posts to use fallback image.');
    }
}

forceFallback();
