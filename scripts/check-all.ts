
import * as fs from 'fs';
import * as path from 'path';

async function checkAll() {
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

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*');

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Total posts: ${posts?.length}`);
    posts?.forEach(p => {
        console.log(`Slug: ${p.slug} | ID: ${p.id} | Title: ${p.title}`);
    });
}

checkAll().catch(console.error);
