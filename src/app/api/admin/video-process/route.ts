/**
 * /api/admin/video-process
 *
 * Operator-driven re-cut of an already-staged video import. Takes trim
 * points + watermark choice, runs the FFmpeg pass, uploads the result
 * to blog-videos under a new path, and persists:
 *   - posts.social_ids.staged_video_url → new URL (publisher will pick
 *     this up on approval, same path used by import-from-url)
 *   - posts.image_settings.video → { trimStart, trimEnd, watermark }
 *     so reopening the editor shows the same slider state
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { trimImportedVideo, isTrimError } from '@/lib/social/video-trim';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { postId, trimStart, trimEnd, watermark } = (body || {}) as {
            postId?: string;
            trimStart?: number;
            trimEnd?: number;
            watermark?: boolean;
        };

        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }
        if (typeof trimStart !== 'number' || typeof trimEnd !== 'number') {
            return NextResponse.json({ success: false, error: 'trimStart and trimEnd (numbers) are required' }, { status: 400 });
        }
        if (trimEnd <= trimStart) {
            return NextResponse.json({ success: false, error: 'trimEnd must be greater than trimStart' }, { status: 400 });
        }

        const { data: post, error: fetchErr } = await supabaseAdmin
            .from('posts')
            .select('id, social_ids, image_settings')
            .eq('id', postId)
            .single();

        if (fetchErr || !post) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }

        const sourceUrl = (post.social_ids as any)?.staged_video_url;
        if (!sourceUrl || typeof sourceUrl !== 'string') {
            return NextResponse.json(
                { success: false, error: 'No staged video on this post — nothing to process' },
                { status: 400 },
            );
        }

        // Run the FFmpeg pass.
        const result = await trimImportedVideo(sourceUrl, postId, {
            trimStart,
            trimEnd,
            watermark: !!watermark,
        });

        if (isTrimError(result)) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        // Persist the new URL + remember the slider/toggle state so reopening
        // the editor shows the same settings.
        const existingSocial = (post.social_ids as Record<string, any>) || {};
        const existingSettings = (post.image_settings as Record<string, any>) || {};

        const { error: updateErr } = await supabaseAdmin
            .from('posts')
            .update({
                social_ids: {
                    ...existingSocial,
                    staged_video_url: result.bucket_url,
                    import_duration_seconds: result.duration_seconds,
                    import_bytes: result.bytes,
                },
                image_settings: {
                    ...existingSettings,
                    video: {
                        // The trim we just applied is BAKED into the new
                        // bucket file. Persist "no further trim" so reopening
                        // the editor shows the full new clip; otherwise the
                        // operator's stored start/end would re-cut the
                        // already-trimmed video on the next save (double cut).
                        trimStart: 0,
                        trimEnd: result.duration_seconds,
                        watermark: false,
                        // Keep the pre-trim URL so a future feature could let
                        // the operator restore from the original.
                        sourceUrl,
                        // Audit trail: what was actually applied this round.
                        lastApplied: {
                            trimStart,
                            trimEnd,
                            watermark: !!watermark,
                            at: new Date().toISOString(),
                        },
                    },
                },
            })
            .eq('id', postId);

        if (updateErr) {
            return NextResponse.json(
                { success: false, error: `DB update failed: ${updateErr.message}` },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            staged_video_url: result.bucket_url,
            bucket_path: result.bucket_path,
            bytes: result.bytes,
            duration_seconds: result.duration_seconds,
        });
    } catch (e: any) {
        console.error('[video-process] error', e);
        return NextResponse.json(
            { success: false, error: e?.message || 'Internal error' },
            { status: 500 },
        );
    }
}
