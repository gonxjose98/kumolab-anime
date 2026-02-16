
import { fetchAnimeIntel } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function dumpIntel() {
    console.log("Dumping Intel...");
    const items = await fetchAnimeIntel();
    items.forEach(item => {
        console.log(`[${item.publishedAt}] ID: ${item.anime_id} | Title: ${item.title}`);
    });
}

dumpIntel();
