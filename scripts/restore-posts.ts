
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function restore() {
    const { generateIntelPost, generateTrendingPost } = await import('../src/lib/engine/generator');
    const { fetchAnimeIntel, fetchTrendingSignals } = await import('../src/lib/engine/fetchers');

    console.log('--- RESTORING INTEL & TRENDING POSTS ---');

    const intelItems = await fetchAnimeIntel();
    const trendingSignals = await fetchTrendingSignals();
    const now = new Date();

    for (const item of intelItems) {
        const post = await generateIntelPost([item], now);
        if (post) {
            const { error } = await supabase.from('posts').upsert([{
                title: post.title,
                slug: post.slug,
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: post.isPublished,
                claim_type: post.claimType,
                premiere_date: post.premiereDate
            }]);
            if (error) console.error(error);
            else console.log(`Restored Intel: ${post.title}`);
        }
    }

    for (const item of trendingSignals) {
        const post = await generateTrendingPost(item, now);
        if (post) {
            const { error } = await supabase.from('posts').upsert([{
                title: post.title,
                slug: post.slug,
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: post.isPublished,
                verification_reason: item.trendReason
            }]);
            if (error) console.error(error);
            else console.log(`Restored Trending: ${post.title}`);
        }
    }
}

restore().catch(console.error);
