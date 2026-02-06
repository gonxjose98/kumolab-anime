
import { generateIntelImage } from '../src/lib/engine/image-processor';
import fs from 'fs';

async function debug() {
    console.log("Debugging Pokémon image generation with Amazon...");
    const url = "https://m.media-amazon.com/images/M/MV5BZjJlM2Y3YTAtYmI0ZC00ZGU5LWFlYjctYTkwM2Y0YjFjZDEyXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg";
    try {
        const result = await generateIntelImage({
            sourceUrl: url,
            animeTitle: "Pokémon Horizons",
            headline: "Season 3 Confirmed",
            slug: "pokemon-debug",
            classification: "CLEAN",
            applyText: true,
            skipUpload: true
        });

        if (result) {
            console.log("Success! Length:", result.processedImage.length);
        } else {
            console.log("Failed (Returned null)");
        }
    } catch (e) {
        console.error("DEBUG ERROR:", e);
    }
}

debug();
