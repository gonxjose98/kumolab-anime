
import fetch from 'node-fetch';
import sharp from 'sharp';

async function checkDims(url: string, label: string) {
    try {
        const res = await fetch(url);
        const buffer = await res.buffer();
        const meta = await sharp(buffer).metadata();
        console.log(`${label}: ${meta.width}x${meta.height}`);
    } catch (e) {
        console.error(`${label} failed:`, e);
    }
}

async function run() {
    await checkDims("https://image.api.playstation.com/vulcan/ap/rnd/202006/1400/a290h6wGNxdaXldfBBCAAxe8.jpg", "PS_Image");
}

run();
