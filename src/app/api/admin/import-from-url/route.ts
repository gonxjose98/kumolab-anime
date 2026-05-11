/**
 * /api/admin/import-from-url
 *
 * Operator-driven video import from X (twitter.com / x.com) or Instagram.
 * Replaces the manual savethevideo.com → upload-from-disk workflow.
 *
 * Flow:
 *   1. Detect platform from the URL
 *   2. Call the yt-dlp worker to download the video (also returns original
 *      post title + description for AI context)
 *   3. Stage MP4 in the blog-videos bucket
 *   4. Run AI title + caption draft (auto-fetched original text + operator notes)
 *   5. Insert a pending `posts` row with social_ids.staged_video_url set
 *      so the publisher cron later finds the pre-staged video
 *   6. Return { editorUrl } so the modal can redirect to /admin/post/[id]
 *
 * No duplicate detection (operator-curated by design — Jose's call).
 * No auto-publish — always lands as 'pending' for review.
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
    fetchSocialVideoToBucket,
    detectSocialPlatform,
    isSocialVideoError,
} from '@/lib/social/social-video-fetcher';
import { draftImportedPost } from '@/lib/engine/ai-import-draft';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { url, notes } = (body || {}) as { url?: string; notes?: string };

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 });
        }

        const platform = detectSocialPlatform(url);
        if (!platform) {
            return NextResponse.json(
                { success: false, error: 'Only X (twitter.com / x.com) and Instagram URLs are supported' },
                { status: 400 },
            );
        }

        const userNotes = (typeof notes === 'string' ? notes : '').trim();

        // Pre-generate the post ID + slug so the bucket path can reference it.
        const postId = randomUUID();
        const slugSeed = `import-${platform}-${postId.split('-')[0]}`;

        // 1. Fetch video into the blog-videos bucket.
        const staged = await fetchSocialVideoToBucket(url, slugSeed);
        if (isSocialVideoError(staged)) {
            return NextResponse.json({ success: false, error: staged.error }, { status: 502 });
        }

        // 2. AI draft (title + caption). Falls back to deterministic templates
        // if every AI provider is down, so this never blocks the import.
        const draft = await draftImportedPost({
            platform,
            originalText: staged.original_description || staged.original_title || '',
            userNotes,
        });

        // 3. Build the final slug from the AI title so the URL is readable
        // when this eventually publishes to the blog.
        const slugBase = draft.title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 80) || slugSeed;
        const slug = `${slugBase}-${postId.split('-')[0]}`;

        const now = new Date();
        const captionTrimmed = draft.caption.slice(0, 5000);

        // 4. Insert pending post. Key wiring:
        //   - image: null  (video posts use staged_video_url, no thumbnail yet)
        //   - source_url: original URL  (kept for traceability, but it's an
        //     X/IG URL so the publisher's YouTube branch won't fire)
        //   - social_ids.staged_video_url: bucket URL — publisher will pick
        //     this up via the patched _prestagedVideoUrl fallback path
        //   - claim_type: OTHER (operator-curated, bypasses auto-approval)
        //   - status: 'pending' so it lands in the review queue
        const { error: insertErr } = await supabaseAdmin.from('posts').insert({
            id: postId,
            slug,
            title: draft.title,
            content: draft.caption,
            excerpt: captionTrimmed.slice(0, 280),
            image: null,
            type: 'INTEL',
            claim_type: 'OTHER',
            source: platform === 'x' ? 'X Import' : 'Instagram Import',
            source_url: url,
            status: 'pending',
            is_published: false,
            timestamp: now.toISOString(),
            published_at: null,
            expires_at: null,
            anime_id: null,
            social_ids: {
                staged_video_url: staged.bucket_url,
                import_platform: platform,
                import_bytes: staged.bytes,
                import_duration_seconds: staged.duration_seconds,
            },
        });

        if (insertErr) {
            return NextResponse.json(
                { success: false, error: `DB insert failed: ${insertErr.message}` },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            postId,
            slug,
            editorUrl: `/admin/post/${postId}`,
            platform,
            staged_video_url: staged.bucket_url,
            ai: {
                title: draft.title,
                caption: draft.caption,
            },
        });
    } catch (e: any) {
        console.error('[import-from-url] error', e);
        return NextResponse.json(
            { success: false, error: e?.message || 'Internal error' },
            { status: 500 },
        );
    }
}
