
import { fetchSmartTrendingCandidates } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function debugSmart() {
    console.log("--- DEBUGGING SMART CANDIDATES ---");
    try {
        const candidates = await fetchSmartTrendingCandidates();
        console.log(`Found ${candidates.length} candidates:`);
        for (const c of candidates) {
            console.log(`\n- ${c.title} (Score: ${c.finalScore})`);
        }
    } catch (e) {
        console.error("FATAL ERROR in debugSmart:", e);
    }
}

debugSmart();
