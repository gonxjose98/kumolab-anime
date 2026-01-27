
import { generateIntelImage } from '../src/lib/engine/image-processor';
import fs from 'fs';
import path from 'path';

async function test() {
    console.log("Starting Image Gen Test...");

    // 1. Mock Wistoria Image (Wide Aspect Ratio to test Cover logic)
    // 1920x1080 usually
    const partialUrl = 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/174576-6stJnscy5rCi.jpg';

    const b64 = await generateIntelImage({
        sourceUrl: partialUrl,
        animeTitle: "Wistoria: Wand and Sword",
        headline: "SEASON 2 CONFIRMED",
        slug: "test-wistoria",
        skipUpload: true, // Return base64
        scale: 1.0,
        position: { x: 0, y: 0 },
        applyText: true,
        applyGradient: true,
        applyWatermark: true,
        purpleWordIndices: [0, 1]
    });

    if (b64) {
        console.log("Image Generated! Base64 Length:", b64.length);
        const data = b64.replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(data, 'base64');
        fs.writeFileSync('debug-output.png', buf);
        console.log("Saved to debug-output.png");
    } else {
        console.error("Failed to generate.");
    }
}

test();
