export {};

import dotenv from 'dotenv';
import path from 'path';

// Load env from root
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function manualRun() {
    console.log('--- RE-RUNNING TRENDING SLOT (16:00) ---');
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

    // Dynamically import engine after env is loaded
    const { runBlogEngine } = await import('../src/lib/engine/engine');

    try {
        const result = await runBlogEngine('16:00', true);
        if (result) {
            console.log('✅ Success! Post generated:', result.title);
        } else {
            console.log('❌ Failed to generate post.');
        }
    } catch (error) {
        console.error('🔥 Error:', error);
    }
}

manualRun();

