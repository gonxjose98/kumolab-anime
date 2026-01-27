
import { fetchAniListTrending, fetchTrendingSignals, fetchAnimeIntel } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function debugIndividual() {
    console.log("1. Testing fetchAniListTrending...");
    const aniList = await fetchAniListTrending();
    console.log(`   AniList: ${aniList.length}`);

    console.log("2. Testing fetchTrendingSignals...");
    const reddit = await fetchTrendingSignals();
    console.log(`   Reddit: ${reddit.length}`);

    console.log("3. Testing fetchAnimeIntel...");
    const news = await fetchAnimeIntel();
    console.log(`   News: ${news.length}`);
}

debugIndividual();
