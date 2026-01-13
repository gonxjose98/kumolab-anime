import { generateIntelImage } from '../src/lib/engine/image-processor';

async function test() {
    const result = await generateIntelImage(
        "https://images.unsplash.com/photo-1626544827763-d516dce335ca",
        "Boruto: Two Blue Vortex",
        "Official Confirmation",
        "boruto-two-blue-vortex-announcement"
    );
    console.log("Result:", result);
}

test().catch(console.error);
