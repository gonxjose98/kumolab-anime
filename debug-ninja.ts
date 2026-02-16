
import { fetchAnimeIntel } from './src/lib/engine/fetchers';
import { validatePost } from './src/lib/engine/generator';
import { getPosts } from './src/lib/blog';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debugNinja() {
    console.log("Debugging Ninja Scroll...");
    const items = await fetchAnimeIntel();
    const ninja = items.find(i => i.title.toLowerCase().includes("ninja scroll"));

    if (ninja) {
        console.log("Found Ninja Scroll item:", JSON.stringify(ninja, null, 2));
        const existing = await getPosts(true);
        // We can't easily generate it here because generator is complex, but we can check validation if we had a post
    } else {
        console.log("Ninja Scroll not found in Intel items. Checking why...");
        // Re-run the fetching logic manually or check filter logs
    }
}

debugNinja();
