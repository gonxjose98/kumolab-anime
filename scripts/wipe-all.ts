export {};

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

async function wipeAll() {
    console.log('--- WIPING ALL POSTS FOR CLEAN REGEN ---');
    const { error } = await supabase.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(error);
    else console.log('Successfully wiped Supabase posts.');
}

// Safety guard (Fable security pass): this deletes EVERY row in `posts` using
// the production service-role key. Refuse to run unless the operator explicitly
// opts in, so an accidental `tsx scripts/wipe-all.ts` (or an editor "run file")
// can't nuke prod. Require BOTH an env flag and a --confirm arg.
function assertConfirmed() {
    const flag = process.env.WIPE_ALL_CONFIRM === 'YES';
    const arg = process.argv.includes('--confirm');
    if (!flag || !arg) {
        console.error(
            '\nRefusing to wipe. This deletes ALL posts in production.\n' +
            'To proceed intentionally, run:\n' +
            '  WIPE_ALL_CONFIRM=YES tsx scripts/wipe-all.ts --confirm\n',
        );
        process.exit(1);
    }
    console.warn(`Target: ${supabaseUrl}`);
}

assertConfirmed();
wipeAll().catch(console.error);

