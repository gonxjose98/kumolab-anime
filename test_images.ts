import { selectBestImage } from './src/lib/engine/image-selector';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    const titles = [
        "Let's Go Karaoke!'s Yama Wayama Plans to Launch New Work in 2027",
        "Fire Force",
        "Chained Soldier",
        "OSHI NO KO",
        "SHIBOYUGI"
    ];

    for (const title of titles) {
        console.log(`\n--- Testing image for: ${title} ---`);
        const result = await selectBestImage(title);
        console.log('Result:', result);
    }
}

test();
