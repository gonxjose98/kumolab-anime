export { };
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function regenerate() {
    // 1. Get current date in EST
    const now = new Date();
    const estDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const [month, day, year] = estDateStr.split('/');
    const today = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    console.log(`--- REGENERATING DAILY DROPS FOR ${today} ---`);

    // 2. Delete existing DROP post for today
    const { data: deleted, error: delError } = await supabase
        .from('posts')
        .delete()
        .eq('type', 'DROP')
        .ilike('title', `%${today}%`);

    if (delError) {
        console.error('Delete error:', delError);
    } else {
        console.log(`Deleted existing drops for ${today}`);
    }

    // 3. Import and run engine for 08:00 slot
    const { runBlogEngine } = await import('../src/lib/engine/engine');
    console.log('Running engine for 08:00 slot...');
    const post = await runBlogEngine('08:00', true);

    if (post) {
        console.log(`[SUCCESS] Regenerated Today's Drops: ${post.title}`);
    } else {
        console.log('[INFO] No post generated (possibly no data or error).');
    }
}

regenerate().catch(console.error);
