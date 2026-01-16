export {};
import { generateIntelImage } from '../src/lib/engine/image-processor';

async function test() {
    const result = await generateIntelImage({
        sourceUrl: "https://images.unsplash.com/photo-1626544827763-d516dce335ca",
        animeTitle: "Boruto: Two Blue Vortex",
        headline: "Official Confirmation",
        slug: "boruto-two-blue-vortex-announcement"
    });
    console.log("Result:", result);
}

test().catch(console.error);

