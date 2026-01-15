
import * as fs from 'fs';
import * as path from 'path';

async function checkImage() {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) process.env[key.trim()] = value.trim();
        });
    }

    const { supabase } = await import('../src/lib/supabase/client');
    const { data, error } = await supabase
        .from('posts')
        .select('image')
        .eq('slug', 'frieren-s2-announced-2026-01-15')
        .single();

    if (error) {
        console.error('Fetch Error:', error);
        return;
    }

    if (data && data.image) {
        console.log('Image type:', typeof data.image);
        console.log('Image length:', data.image.length);
        console.log('Image start:', data.image.substring(0, 100));
    } else {
        console.log('Image is null or empty in DB.');
    }
}

checkImage().catch(console.error);
