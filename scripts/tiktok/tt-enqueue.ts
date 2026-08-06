export { };

// Manually queue a post for TikTok.
//
// Normally the publisher does this automatically when a post lands on Instagram
// (see src/lib/social/publisher.ts). This script is for the cases where that
// didn't happen: backfilling something already published, re-queueing after a
// failure, or verifying the runner end to end.
//
// It deliberately reuses buildSocialCaption — the SAME caption Instagram got —
// so what this queues is identical to what the automatic path would queue.
//
// HOW TO RUN
//   cd workspace-kumolab
//   npx tsx scripts/tiktok/tt-enqueue.ts <slug>     queue one post by slug
//   npx tsx scripts/tiktok/tt-enqueue.ts --latest   queue the most recent
//                                                   IG-published post with video

const fs = require('fs');
const path = require('path');

// Load env before importing anything that reads it.
const envPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key && value && !key.startsWith('#')) process.env[key] = value;
    }
}

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const { buildSocialCaption } = await import('../../src/lib/social/caption');

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const arg = process.argv[2];
    if (!arg) {
        console.error('usage: tt-enqueue.ts <slug> | --latest');
        process.exit(1);
    }

    let query = db
        .from('posts')
        .select('id, slug, title, excerpt, content, claim_type, anime_id, hashtags, caption_override, social_ids')
        .not('social_ids->>staged_video_url', 'is', null);

    if (arg === '--latest') {
        // Only posts that actually reached Instagram — the same bar the
        // automatic path uses, so this can't queue something the mirror rule
        // would have rejected.
        query = query
            .not('social_ids->>instagram_id', 'is', null)
            .order('published_at', { ascending: false })
            .limit(1);
    } else {
        query = query.eq('slug', arg).limit(1);
    }

    const { data, error } = await query;
    if (error) { console.error('query failed:', error.message); process.exit(1); }
    if (!data || data.length === 0) { console.error('no matching post found'); process.exit(1); }

    const post: any = data[0];
    const videoUrl = post.social_ids?.staged_video_url;
    const caption = buildSocialCaption(post);

    const { data: existing } = await db
        .from('tiktok_queue').select('id, status').eq('post_id', post.id).maybeSingle();
    if (existing && existing.status === 'posted') {
        console.log(`already posted to TikTok: ${post.slug}`);
        return;
    }

    const row = {
        post_id: post.id,
        slug: post.slug,
        title: post.title,
        video_url: videoUrl,
        caption,
        status: 'pending',
        attempts: 0,
        last_error: null,
    };
    const { error: writeErr } = existing
        ? await db.from('tiktok_queue').update(row).eq('id', existing.id)
        : await db.from('tiktok_queue').insert(row);
    if (writeErr) { console.error('enqueue failed:', writeErr.message); process.exit(1); }

    console.log(`queued for TikTok: ${post.slug}`);
    console.log(`  video:   ${videoUrl}`);
    console.log(`  caption: ${caption.replace(/\n/g, ' ⏎ ').slice(0, 160)}…`);
    console.log('\nrun it with: node scripts/tiktok/tt-runner.mjs');
}

main().catch((e) => { console.error('fatal:', e?.message || e); process.exitCode = 1; });
