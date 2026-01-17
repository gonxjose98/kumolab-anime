
import { generateIntelImage } from '../src/lib/engine/image-processor';
// Mock fetch to avoid network logic for simple test or use real URL
// We'll use a real URL that is likely to exist.
// Frieren (Verified existence usually, or use a generic one)
const TEST_IMAGE_URL = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153518-7F1aX302rF9c.jpg';
// Actually let's use a very standard one
const TEST_IMAGE_URL_ALT = 'https://upload.wikimedia.org/wikipedia/en/4/4b/Frieren_manga_vol_1.jpg';

async function test() {
    console.log("Testing Image Generation...");
    try {
        const result = await generateIntelImage({
            sourceUrl: TEST_IMAGE_URL_ALT,
            animeTitle: "Frieren: Beyond Journey's End",
            headline: "SEASON 2 CONFIRMED",
            slug: "test-frieren-gen",
            textPosition: 'bottom'
        });

        console.log("Result URL:", result);
        if (!result) console.error("Result was null!");
    } catch (e) {
        console.error("Test Failed:", e);
    }
}

test();
