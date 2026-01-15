
import * as fs from 'fs';
import * as path from 'path';

async function forceFix() {
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

    const FRIEREN_IMAGE = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170068-ijY3tCP8KoWP.jpg";
    const SLUG = "frieren-s2-announced-2026-01-15";

    console.log(`Force updating post with slug ${SLUG} with image ${FRIEREN_IMAGE}`);

    const { data, error } = await supabase
        .from('posts')
        .update({ image: FRIEREN_IMAGE })
        .eq('slug', SLUG)
        .select();

    if (error) {
        console.error('Update Error:', error);
    } else {
        console.log('Update Success:', data);
    }
}

forceFix().catch(console.error);
