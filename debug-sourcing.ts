
import { fetchSmartTrendingCandidates } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debugSourcing() {
    console.log("Debugging Sourcing...");
    const result = await fetchSmartTrendingCandidates();

    const oshi = result.candidates.find((c: any) => c.title.toLowerCase().includes("oshi no ko"));
    if (oshi) {
        console.log(`- CANDIDATE: ${oshi.title} (Score: ${oshi.finalScore})`);
        console.log(`  Claim: ${oshi.claimType}`);
        console.log(`  Source: ${oshi.source} | Published: ${oshi.publishedAt}`);
    } else {
        console.log("OSHI NO KO not found in processed candidates (likely ABORTED in fetcher)");
    }
}

debugSourcing();
