
import * as fs from 'fs';
import * as path from 'path';

async function hardFix() {
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

    console.log(`Deleting post with slug ${SLUG}...`);
    const { error: delError } = await supabase
        .from('posts')
        .delete()
        .eq('slug', SLUG);

    if (delError) {
        console.error('Delete Error:', delError);
    } else {
        console.log('Delete Success.');
    }

    console.log(`Inserting fixed post...`);
    const { data, error: insError } = await supabase
        .from('posts')
        .insert([{
            title: "Frieren Season 2 Officially Confirmed",
            slug: SLUG,
            type: "INTEL",
            claim_type: "confirmed",
            premiere_date: "2026-10-01",
            content: "Studio Madhouse has officially confirmed Frieren Season 2 is in production. The sequel will follow the El Dorado arc.",
            image: FRIEREN_IMAGE,
            timestamp: new Date().toISOString(),
            is_published: true
        }])
        .select();

    if (insError) {
        console.error('Insert Error:', insError);
    } else {
        console.log('Insert Success:', data);
    }
}

hardFix().catch(console.error);
