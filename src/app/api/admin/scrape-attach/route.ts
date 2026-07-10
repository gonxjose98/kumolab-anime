/**
 * /api/admin/scrape-attach
 *
 * Second half of the "Find Video" scrape flow. Takes the YouTube URL the
 * operator picked from the search results, downloads the muxed MP4 via
 * the existing yt-dlp worker (Render), and enriches the existing pending
 * row with social_ids.staged_video_url so the standard publisher path
 * later finds the staged video.
 *
 * Key differences vs auto-publish trailer fetch:
 *   - skipSocialProcessing: no 9:16 letterbox / 60s trim — operator
 *     trims in the editor.
 *   - maxDurationSeconds: 300 (vs 180) — fits longer OPs/trailers.
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchYouTubeToBucket } from '@/lib/social/trailer-fetcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isYouTubeUrl(raw: string): boolean {
    try {
        const u = new URL(raw);
        const h = u.hostname.toLowerCase();
        return h.includes('youtube.com') || h.includes('youtu.be');
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { postId, youtubeUrl } = (body || {}) as {
            postId?: string;
            youtubeUrl?: string;
        };

        if (!postId || typeof postId !== 'string') {
            return NextResponse.json(
                { success: false, error: 'postId is required' },
                { status: 400 },
            );
        }
        if (!youtubeUrl || typeof youtubeUrl !== 'string') {
            return NextResponse.json(
                { success: false, error: 'youtubeUrl is required' },
                { status: 400 },
            );
        }
        if (!isYouTubeUrl(youtubeUrl)) {
            return NextResponse.json(
                { success: false, error: 'URL must be a YouTube link' },
                { status: 400 },
            );
        }

        // Confirm the post exists and is still pending. Attaching to a
        // post that's already approved/published would silently overwrite
        // its staged_video_url, which is almost certainly not what the
        // operator wants.
        const { data: post, error: postErr } = await supabaseAdmin
            .from('posts')
            .select('id, slug, status, social_ids, image_settings')
            .eq('id', postId)
            .maybeSingle();

        if (postErr || !post) {
            return NextResponse.json(
                { success: false, error: 'Post not found' },
                { status: 404 },
            );
        }
        if (post.status !== 'pending') {
            return NextResponse.json(
                {
                    success: false,
                    error: `Post is ${post.status}, not pending. Find Video only attaches to pending posts.`,
                },
                { status: 400 },
            );
        }

        const slugBase = post.slug || `scrape-${postId.split('-')[0]}`;

        const staged = await fetchYouTubeToBucket(youtubeUrl, slugBase, {
            skipSocialProcessing: true,
            maxDurationSeconds: 300,
        });

        if (!staged) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        'Worker failed to download the video. The video may be private, region-locked, age-gated, or longer than 5 minutes. Check error_logs for the precise reason.',
                },
                { status: 502 },
            );
        }

        const prevSocialIds = (post.social_ids as Record<string, any>) || {};
        const newSocialIds = {
            ...prevSocialIds,
            staged_video_url: staged.bucket_url,
            staged_video_path: staged.bucket_path,
            staged_video_source: 'youtube_scrape',
            import_platform: 'youtube',
            import_bytes: staged.bytes,
            import_duration_seconds: staged.duration_seconds,
            youtube_video_id_scraped: staged.video_id,
            scraped_at: new Date().toISOString(),
        };

        // Downloading a video makes this your active work: move it to draft and
        // stamp studio activity so it lands in the Studio workbench (Jose,
        // 2026-07-10 — "if I download a video from pending it goes to drafts").
        const newImageSettings = {
            ...((post.image_settings as Record<string, any>) || {}),
            studio_edited_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabaseAdmin
            .from('posts')
            .update({
                social_ids: newSocialIds,
                youtube_video_id: staged.video_id,
                status: 'draft',
                image_settings: newImageSettings,
            })
            .eq('id', postId);

        if (updErr) {
            return NextResponse.json(
                { success: false, error: `DB update failed: ${updErr.message}` },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            postId,
            editorUrl: `/admin/post/${postId}`,
            staged_video_url: staged.bucket_url,
            duration_seconds: staged.duration_seconds,
            bytes: staged.bytes,
        });
    } catch (e: any) {
        console.error('[scrape-attach] error', e);
        return NextResponse.json(
            { success: false, error: e?.message || 'Internal error' },
            { status: 500 },
        );
    }
}
