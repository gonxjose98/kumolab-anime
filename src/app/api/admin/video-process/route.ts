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
        const { postId, trimStart, trimEnd, watermark, backgroundFill, fillStyle, blurIntensity, textOverlays } =
            (body || {}) as {
                postId?: string;
                trimStart?: number;
                trimEnd?: number;
                watermark?: boolean;
                backgroundFill?: boolean;
                fillStyle?: 'black' | 'white' | 'blur';
                blurIntensity?: number;
                textOverlays?: Array<{ text?: string; xPct?: number; yPct?: number; color?: string; sizePct?: number }>;
            };

        const safeFillStyle: 'black' | 'white' | 'blur' =
            fillStyle === 'black' || fillStyle === 'blur' ? fillStyle : 'white';
        const safeBlurIntensity =
            typeof blurIntensity === 'number' && isFinite(blurIntensity)
                ? Math.min(40, Math.max(2, Math.round(blurIntensity)))
                : 20;

        // Sanitise text overlays — clamp positions/sizes, validate colour,
        // drop blanks, cap at 8 blocks. Never trust client geometry.
        const num = (v: any, min: number, max: number, dflt: number) =>
            typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
        const safeTextOverlays = (Array.isArray(textOverlays) ? textOverlays : [])
            .filter((o) => o && typeof o.text === 'string' && o.text.trim().length > 0)
            .slice(0, 8)
            .map((o) => ({
                text: String(o.text).slice(0, 120),
                xPct: num(o.xPct, 0, 1, 0.5),
                yPct: num(o.yPct, 0, 1, 0.1),
                color: typeof o.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(o.color.trim()) ? o.color.trim() : '#ffffff',
                sizePct: num(o.sizePct, 0.02, 0.12, 0.045),
            }));

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

        // Always cut from the original — never from a previously-trimmed
        // staged file. `original_video_url` is set at import time and is
        // immutable; staged_video_url is the operator's current working
        // file. Legacy posts (imported before original_video_url existed)
        // fall back to staged_video_url, which on a never-trimmed post is
        // identical to the original.
        const existingSocial = (post.social_ids as Record<string, any>) || {};
        const sourceUrl: string | undefined =
            existingSocial.original_video_url || existingSocial.staged_video_url;
        if (!sourceUrl || typeof sourceUrl !== 'string') {
            return NextResponse.json(
                { success: false, error: 'No staged video on this post — nothing to process' },
                { status: 400 },
            );
        }

        const result = await trimImportedVideo(sourceUrl, postId, {
            trimStart,
            trimEnd,
            watermark: !!watermark,
            backgroundFill: !!backgroundFill,
            fillStyle: safeFillStyle,
            blurIntensity: safeBlurIntensity,
            textOverlays: safeTextOverlays,
        });

        if (isTrimError(result)) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        const existingSettings = (post.image_settings as Record<string, any>) || {};

        const { error: updateErr } = await supabaseAdmin
            .from('posts')
            .update({
                social_ids: {
                    ...existingSocial,
                    // Backfill original_video_url for legacy rows so this
                    // post stops falling back on subsequent trims.
                    original_video_url: existingSocial.original_video_url || sourceUrl,
                    staged_video_url: result.bucket_url,
                    import_duration_seconds: result.duration_seconds,
                    import_bytes: result.bytes,
                },
                image_settings: {
                    ...existingSettings,
                    video: {
                        // Operator's chosen trim points are now relative to
                        // the immutable original, so we can persist them as-is.
                        // Reopening the editor reloads the original AND shows
                        // the handles where the operator last placed them.
                        trimStart,
                        trimEnd,
                        watermark: !!watermark,
                        backgroundFill: !!backgroundFill,
                        fillStyle: safeFillStyle,
                        blurIntensity: safeBlurIntensity,
                        textOverlays: safeTextOverlays,
                        lastApplied: {
                            trimStart,
                            trimEnd,
                            watermark: !!watermark,
                            backgroundFill: !!backgroundFill,
                            fillStyle: safeFillStyle,
                            blurIntensity: safeBlurIntensity,
                            textOverlays: safeTextOverlays,
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
