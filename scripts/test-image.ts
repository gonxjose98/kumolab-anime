
import { generateIntelImage } from '../src/lib/engine/image-processor';
import path from 'path';

async function test() {
    console.log("Testing Image Generation...");
    try {
        const result = await generateIntelImage({
            sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
            animeTitle: 'TEST ANIME TITLE',
            headline: 'BREAKING NEWS',
            slug: 'test-slug',
            skipUpload: true
        });
        console.log("Result:", result ? "Base64 Data (Success)" : "NULL (Failure)");
    } catch (e) {
        console.error("Test Failed W/ Exception:", e);
    }
}

test();
