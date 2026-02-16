import { fetchSmartTrendingCandidates } from '../src/lib/engine/fetchers';
import { generateIntelPost, generateTrendingPost, validatePost } from '../src/lib/engine/generator';
import { getPosts } from '../src/lib/blog';

async function checkToday() {
    console.log("--- KumoLab Today Check ---");
    const now = new Date();
    const result = await fetchSmartTrendingCandidates();
    const candidates = result.candidates;
    const existingPosts = await getPosts(true);

    console.log(`Found ${candidates.length} candidates.`);

    for (const item of candidates) {
        console.log(`\nChecking: ${item.title} (${item.claimType})`);

        const post = await (item.source === 'KumoLab SmartSync' ? generateTrendingPost(item, now) : generateIntelPost([item], now));

        if (!post) {
            console.log("  [SKIP] Generator returned null (Strict rule or missing visual).");
            continue;
        }

        const isValid = validatePost(post, existingPosts, false);
        if (isValid) {
            console.log(`  [VALID] Should go up! Fingerprint: ${post.event_fingerprint}`);
            console.log(`  Title: ${post.title}`);
            console.log(`  Visual: ${post.image}`);
        } else {
            console.log("  [SKIP] Post failed validation (Duplicate or Image Check).");
        }
    }
}

checkToday().catch(console.error);
