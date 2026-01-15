
import * as fs from 'fs';
import * as path from 'path';

async function verifyDelete() {
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

    const SLUG = "frieren-s2-announced-2026-01-15";

    console.log(`Checking for ${SLUG}...`);
    let { data: before } = await supabase.from('posts').select('*').eq('slug', SLUG);
    console.log(`Found before: ${before?.length}`);

    console.log(`Deleting ${SLUG}...`);
    const { error } = await supabase.from('posts').delete().eq('slug', SLUG);
    if (error) console.error('Delete error:', error);

    console.log(`Checking again...`);
    let { data: after } = await supabase.from('posts').select('*').eq('slug', SLUG);
    console.log(`Found after: ${after?.length}`);

    if (after?.length === 0) {
        console.log('Post deleted successfully. Inserting now with image.');
        const FRIEREN_IMAGE = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170068-ijY3tCP8KoWP.jpg";
        const { error: insError } = await supabase.from('posts').insert([{
            title: "Frieren Season 2 Officially Confirmed",
            slug: SLUG,
            type: "INTEL",
            claim_type: "confirmed",
            premiere_date: "2026-10-01",
            content: "Studio Madhouse has officially confirmed Frieren Season 2 is in production. The sequel will follow the El Dorado arc.",
            image: FRIEREN_IMAGE,
            timestamp: new Date().toISOString(),
            is_published: true
        }]);
        if (insError) console.error('Insert error:', insError);
        else console.log('Insert successful!');
    } else {
        console.error('CRITICAL: Post still exists after delete.');
    }
}

verifyDelete().catch(console.error);
