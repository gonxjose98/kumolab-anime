import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { publishToSocials } from '@/lib/social/publisher';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Manual upload + multi-platform publish.
 *
 * Flow (browser-driven, designed to handle videos up to ~100 MB):
 *   1. Browser uploads the MP4/JPG directly to Supabase Storage
 *      (blog-videos for video, blog-images for image) using the user's
 *      authenticated session — bypasses Vercel's 4.5 MB body limit.
 *   2. Browser POSTs the resulting public URL + caption + optional
 *      "via @creator" credit + optional title to this route.
 *   3. We create a `posts` row (status='published'), then call the
 *      shared publishToSocials() so the standard IG Reels / FB Reels /
 *      Threads VIDEO path runs against our staged media.
 *
 * Auth: middleware.ts gates /api/admin/* by Supabase session.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { mediaUrl, mediaType, title, caption, credit, mode } = body || {};

        // Mode:
        //   'publish' — old behavior. Insert post as published + fan out
        //               to socials immediately. Used for VIDEO uploads
        //               where there's no editor work to do — just stage
        //               the MP4 and post it.
        //   'draft'   — insert post as PENDING, no social publish. Caller
        //               (browser) redirects to /admin/post/[id] so the
        //               operator can use the full editor: title, caption,
        //               text/gradient/watermark overlays, convertToReel
        //               toggle, image upload swap, etc. Approve from
        //               there to publish via the standard flow.
        const isDraft = mode === 'draft';

        if (!mediaUrl || typeof mediaUrl !== 'string') {
            return NextResponse.json({ success: false, error: 'mediaUrl is required' }, { status: 400 });
        }
        if (mediaType !== 'video' && mediaType !== 'image') {
            return NextResponse.json({ success: false, error: 'mediaType must be "video" or "image"' }, { status: 400 });
        }
        // Title and caption are required only in publish mode. In draft
        // mode they can be empty placeholders — the operator fills them
        // in via the editor.
        if (!isDraft && (!caption || typeof caption !== 'string')) {
            return NextResponse.json({ success: false, error: 'caption is required' }, { status: 400 });
        }
        if (!isDraft && (!title || typeof title !== 'string' || !title.trim())) {
            return NextResponse.json({ success: false, error: 'title is required' }, { status: 400 });
        }

        const titleClean = (title && typeof title === 'string' && title.trim())
            ? title.trim().slice(0, 200)
            : 'Untitled — KumoLab Upload';
        const captionInput = (caption && typeof caption === 'string') ? caption.trim() : '';
        const captionFinal = credit && typeof credit === 'string' && credit.trim()
            ? `${captionInput}\n\nvia @${credit.trim().replace(/^@/, '')}`
            : captionInput;

        // Slug: lowercased title + short uuid suffix to guarantee uniqueness
        const slugBase = titleClean.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
        const slug = `${slugBase}-${randomUUID().split('-')[0]}`;

        const postId = randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 60 * 24 * 3600 * 1000); // 60 days, matches default retention

        const isVideo = mediaType === 'video';

        // Insert the post row. For videos the `image` column gets the
        // poster thumbnail (we don't have one yet, so we leave it null
        // and the publisher uses the staged_video_url). For images,
        // image gets the uploaded URL and the post publishes as image.
        const { error: insertErr } = await supabaseAdmin.from('posts').insert({
            id: postId,
            slug,
            title: titleClean,
            content: captionFinal,
            excerpt: captionFinal.slice(0, 280),
            image: isVideo ? null : mediaUrl,
            type: 'INTEL',
            claim_type: isVideo ? 'TRAILER_DROP' : 'OTHER',
            source: 'KumoLab Manual Upload',
            source_url: null, // Not a YouTube source — bypasses trailer-fetcher
            status: isDraft ? 'draft' : 'published',
            is_published: !isDraft,
            timestamp: now.toISOString(),
            published_at: isDraft ? null : now.toISOString(),
            expires_at: isDraft ? null : expiresAt.toISOString(),
            anime_id: null,
            social_ids: isVideo && !isDraft ? { staged_video_url: mediaUrl } : {},
        });
        if (insertErr) {
            return NextResponse.json({ success: false, error: `DB insert failed: ${insertErr.message}` }, { status: 500 });
        }

        // Draft mode short-circuits here. Caller redirects to the editor.
        if (isDraft) {
            return NextResponse.json({
                success: true,
                postId,
                slug,
                editorUrl: `/admin/post/${postId}`,
                mode: 'draft',
            });
        }

        // Build the post object the publisher expects. Important:
        // because source_url is null, publisher.ts skips the YouTube
        // trailer-fetcher path entirely. For videos we need to inject
        // staged_video_url manually so the IG/FB/Threads handlers see
        // it and use the Reels/VIDEO flows.
        const post: any = {
            id: postId,
            slug,
            title: titleClean,
            content: captionFinal,
            excerpt: captionFinal.slice(0, 280),
            image: isVideo ? null : mediaUrl,
            source_url: null,
            claim_type: isVideo ? 'TRAILER_DROP' : 'OTHER',
            anime_id: null,
            type: 'INTEL',
        };

        // The publisher's video-staging step looks at source_url (not
        // present here). To make it use the already-uploaded MP4, we
        // call the platform helpers directly via publishToSocials AND
        // pass the staged URL through a side-channel: re-set source_url
        // to a sentinel that bypasses the worker, OR we inline-publish.
        //
        // Cleanest: extend publisher to accept an optional preStagedUrl
        // passed in via a wrapper. For now, set the staged_video_url
        // BEFORE publishToSocials and let it skip the fetch step by
        // recognizing source_url is null.
        //
        // Simpler approach: the publisher only fetches if isYouTubeSource.
        // We don't have a YouTube source, so it won't fetch. Then for
        // video posts, IG/FB/Threads need stagedVideoUrl passed. The
        // current publisher reads it from the local variable, not from
        // the post. So we monkey-patch by setting a non-standard field
        // and modifying publisher to honor it.

        // Inject the prestaged video URL via a non-standard field on
        // the post object — the publisher reads it before deciding to
        // fetch.
        if (isVideo) {
            post._prestagedVideoUrl = mediaUrl;
        }

        const social = await publishToSocials(post).catch(e => ({ error: e?.message || 'publish threw' }));

        // Persist returned IDs onto the post row
        if (social && typeof social === 'object') {
            const merge: Record<string, any> = {};
            for (const key of [
                'instagram_id', 'instagram_url', 'facebook_id', 'facebook_url',
                'threads_id', 'threads_url', 'staged_video_url', 'skipped_reason',
            ] as const) {
                if ((social as any)[key]) merge[key] = (social as any)[key];
            }
            if (Object.keys(merge).length > 0) {
                await supabaseAdmin.from('posts').update({ social_ids: merge }).eq('id', postId);
            }
        }

        return NextResponse.json({
            success: true,
            postId,
            slug,
            blogUrl: `https://kumolabanime.com/blog/${slug}`,
            social,
        });
    } catch (e: any) {
        console.error('[upload-and-publish] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
