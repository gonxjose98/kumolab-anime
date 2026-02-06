
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
    await checkDims("https://s4.anilist.co/file/anilistcdn/media/anime/banner/158871-jKfsW5HCGA3K.jpg", "Banner");
    await checkDims("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx158871-u2G2y5a0W33w.jpg", "Cover");
}

run();
