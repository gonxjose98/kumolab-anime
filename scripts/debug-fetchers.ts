
import { fetchAnimeIntel, fetchSmartTrendingCandidates, fetchOfficialAnimeImage } from '@/lib/engine/fetchers';

async function test() {
    console.log("--- TESTING ANIME INTEL FETCHING & IMAGE SEARCH ---");
    const intelItems = await fetchAnimeIntel();

    if (intelItems.length === 0) {
        console.log("No Intel items found.");
    } else {
        const topItem = intelItems[0];
        console.log(`Top Intel Title: "${topItem.title}"`);
        console.log(`Top Intel Search Term: "${topItem.imageSearchTerm}"`);

        console.log("Attempting Image Search...");
        const img = await fetchOfficialAnimeImage(topItem.imageSearchTerm);
        console.log(`Image Result: ${img ? 'FOUND (' + img.substring(0, 30) + '...)' : 'FAILED (null)'}`);
    }

    console.log("\n--- TESTING TRENDING FETCHING & IMAGE SEARCH ---");
    const trendingItem = await fetchSmartTrendingCandidates();

    if (!trendingItem) {
        console.log("No Trending item found.");
    } else {
        console.log(`Top Trending Title: "${trendingItem.title}"`);
        console.log(`Top Trending Search Term: "${trendingItem.imageSearchTerm}"`);

        if (!trendingItem.image) {
            console.log("Attempting Image Search...");
            const img = await fetchOfficialAnimeImage(trendingItem.imageSearchTerm);
            console.log(`Image Result: ${img ? 'FOUND (' + img.substring(0, 30) + '...)' : 'FAILED (null)'}`);
        } else {
            console.log(`Image already present: ${trendingItem.image.substring(0, 30)}...`);
        }
    }
}

test();
