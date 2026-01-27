
import { generateIntelImage } from '../src/lib/engine/image-processor';
import fs from 'fs';
import path from 'path';

async function verify() {
    const localInput = "C:/Users/Jose G/.gemini/antigravity/brain/0ef14c83-fcc8-4692-9233-f9012698dab7/uploaded_media_1769480013320.jpg";
    // Check if exists, else fallback to url
    const source = fs.existsSync(localInput) ? localInput : 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/174576-6stJnscy5rCi.jpg';

    console.log("Generating using source:", source);

    try {
        const result = await generateIntelImage({
            sourceUrl: source,
            animeTitle: "Wistoria: Wand and Sword",
            headline: "SEASON 2 CONFIRMED",
            slug: "verify-wistoria",
            skipUpload: true,
            // Rules verification:
            applyText: true,
            applyGradient: true,
            applyWatermark: true,
            purpleWordIndices: [0, 1]
        });

        if (result) {
            console.log("Success! Generated base64 string.");
            console.log("Length:", result.length);
            // Save for inspection
            const base64Data = result.replace(/^data:image\/png;base64,/, "");
            const outPath = path.join(process.cwd(), 'public', 'verify-wistoria-output.png');
            fs.writeFileSync(outPath, base64Data, 'base64');
            console.log("Saved verification image to:", outPath);
        } else {
            console.error("Failed generation (null result).");
        }
    } catch (e) {
        console.error("Generation Error:", e);
    }
}

verify();
