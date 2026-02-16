
import { fetchSmartTrendingCandidates } from '../src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testCandidates() {
    console.log('Fetching Smart Trending Candidates...');
    const result = await fetchSmartTrendingCandidates();
    const candidates = result.candidates;
    console.log(`Found ${candidates.length} candidates.`);
    if (candidates.length > 0) {
        console.log('Top Candidate:', JSON.stringify(candidates[0], null, 2));
    }
}

testCandidates();
