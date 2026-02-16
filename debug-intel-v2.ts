
import { fetchAnimeIntel } from './src/lib/engine/fetchers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debugIntel() {
    const items = await fetchAnimeIntel();
    const nao = items.find(i => i.title.includes("Nao Toyama"));
    if (nao) {
        console.log(`Title: ${nao.title}`);
        console.log(`AnimeID: ${nao.anime_id}`);
    }
}

debugIntel();
