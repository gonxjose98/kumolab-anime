
import * as fs from 'fs';
import * as path from 'path';

async function checkPost() {
    const envPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    }

    const { supabase } = await import('../src/lib/supabase/client');

    console.log('--- DB CHECK ---');
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', '%Frieren%')
        .gte('timestamp', '2026-01-15T00:00:00.000Z');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Posts found:', posts?.length);
    posts?.forEach(p => {
        console.log(`ID: ${p.id}`);
        console.log(`Title: ${p.title}`);
        console.log(`Image: "${p.image}"`);
        console.log(`Slug: ${p.slug}`);
    });
}

checkPost().catch(console.error);
