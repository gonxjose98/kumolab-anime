
import { fetchAnimeIntel } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function debugIntel() {
    console.log("--- DEBUGGING INTEL FETCH ---");
    const intel = await fetchAnimeIntel();
    console.log(`Found ${intel.length} items:`);
    for (const item of intel) {
        console.log(`\n- ${item.title}`);
        console.log(`  Source: ${item.source}`);
        console.log(`  Type: ${item.claimType}`);
    }
}

debugIntel();
