
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listBucketFiles() {
    console.log('Listing files in bucket "blog-images"...');
    const { data, error } = await supabase
        .storage
        .from('blog-images')
        .list('', {
            limit: 100,
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
        });

    if (error) {
        console.error('Error listing files:', error);
        return;
    }

    console.log(`Found ${data?.length} files.`);
    data?.forEach(file => {
        console.log(` - ${file.name}`);
    });
}

listBucketFiles();
