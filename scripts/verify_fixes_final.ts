
import { generateIntelImage } from '../src/lib/engine/image-processor';
import fs from 'fs';
import path from 'path';

async function runRegression() {
    console.log("--- STARTING 1080x1350 REGRESSION CHECK ---");

    // 1x1 Blue pixel
    const safeUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    // Case 1: 1080x1350 check
    console.log("\n[Case 1] Dimensions Check (TEXT ON)");
    const res1 = await generateIntelImage({
        sourceUrl: safeUrl,
        slug: 'case-1-1350',
        animeTitle: 'Frieren',
        headline: 'Teaser Visual',
        classification: 'CLEAN',
        applyText: true,
        skipUpload: true
    });

    if (res1) {
        const buffer = Buffer.from(res1.processedImage.split(',')[1], 'base64');
        fs.writeFileSync('regression-1350.png', buffer);
        console.log("✓ Case 1 Written. MANUALLY VERIFY resolution is 1080x1350.");
    } else {
        console.error("✗ Case 1 Failed");
    }

    // Case 2: Aspect Ratio Violation (Panorama)
    console.log("\n[Case 2] Aspect Ratio Violation (2:1 wider than 1.6)");
    const panoramaUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='; // 2:1
    const res2 = await generateIntelImage({
        sourceUrl: panoramaUrl,
        slug: 'case-2-abort',
        animeTitle: 'Wide Test',
        applyText: true,
        skipUpload: true
    });

    if (res2 === null) {
        console.log("✓ Case 2 Correctly Aborted (2:1 rejected)");
    } else {
        console.error("✗ Case 2 Failed to abort");
    }

    console.log("\n--- REGRESSION CHECK COMPLETE ---");
}

runRegression();
