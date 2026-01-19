
import { fetchOfficialAnimeImages } from '../src/lib/engine/fetchers';

async function testImageSearch() {
    const topic = 'Demon Slayer';
    console.log(`Testing image search for: ${topic}`);
    const images = await fetchOfficialAnimeImages(topic);
    console.log('Images found:', images);

    if (images.length > 0) {
        console.log('✅ Image search logic works.');
    } else {
        console.log('❌ No images found. Logic might be flawed.');
    }
}

testImageSearch();
