
import { fetchSmartTrendingCandidates } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debugCandidates() {
    console.log("Debugging Candidates...");
    const { candidates } = await fetchSmartTrendingCandidates();
    const sorted = Object.values(candidates).sort((a: any, b: any) => b.score - a.score);

    sorted.forEach((c: any) => {
        if (c.title.includes("Nao Toyama") || c.title.includes("Ninja Scroll")) {
            console.log(`[CANDIDATE] Title: ${c.title}`);
            console.log(`  SearchTerm: ${c.imageSearchTerm}`);
            console.log(`  AnimeID: ${c.anime_id}`);
            console.log(`  Claim: ${c.claimType}`);
        }
    });
}

debugCandidates();
