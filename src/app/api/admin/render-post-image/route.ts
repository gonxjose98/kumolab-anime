import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateIntelImage } from '@/lib/engine/image-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Renders the overlay image for a post.
 *
 * Two modes:
 *   - persist=false (default) — preview only. Returns a base64 data URL,
 *     does NOT touch Storage and does NOT write posts.image. Used by the
 *     editor's auto-render so the user can experiment freely without
 *     mutating the post until they hit Save.
 *   - persist=true — final render. Uploads PNG to the blog-images bucket
 *     and writes posts.image. Used by the editor's Save flow and by
 *     server-side callers that own the post lifecycle.
 *
 * Settings come from the request body; the v2 schema dropped persistent
 * image settings columns so they live in component state, not the DB.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            postId,
            settings = {},
            sourceUrl: sourceOverride,
            title: titleOverride,
            excerpt: excerptOverride,
            persist = false,
        } = body || {};

        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('id, slug, title, excerpt, image, source_url, youtube_video_id')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return NextResponse.json({ success: false, error: fetchError?.message || 'Post not found' }, { status: 404 });
        }

        const looksLikeImage = (u: string | undefined | null): boolean => {
            if (!u || typeof u !== 'string') return false;
            if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) return true;
            if (/img\.youtube\.com\/vi\//.test(u)) return true;
            if (/i\.ytimg\.com\//.test(u)) return true;
            if (/storage\/v1\/object\/public\//.test(u)) return true;
            if (/youtube\.com\/watch|youtu\.be\/|animenewsnetwork\.com|crunchyroll\.com\/news|myanimelist\.net\/news|\/news\/|\/article\//i.test(u)) return false;
            return false;
        };

        // Source URL resolution priority:
        //   1. Caller's override IF it looks like a direct image URL.
        //   2. YouTube CDN thumbnail when youtube_video_id is set — always
        //      reliable, never goes stale, no auth, original art.
        //   3. post.image as last resort (may be a stale Supabase Storage
        //      URL from a prior render that the cleanup worker has since
        //      swept; we still try it for non-YouTube posts).
        // If everything fails the renderer will return null and we surface
        // a clear error message.
        let sourceUrl: string | null = null;
        if (looksLikeImage(sourceOverride)) {
            sourceUrl = sourceOverride;
        } else if (post.youtube_video_id) {
            sourceUrl = `https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg`;
        } else if (post.image) {
            sourceUrl = post.image;
        }

        if (!sourceUrl) {
            return NextResponse.json({ success: false, error: 'Post has no image to render from. Set a Background image URL in the editor first.' }, { status: 400 });
        }

        // Editor passes current title/excerpt as overrides so Regenerate uses
        // what the user just typed, not stale DB values. Falls back to DB on
        // omitted keys for cron/server callers that don't send them.
        const animeTitle = typeof titleOverride === 'string' ? titleOverride : (post.title || '');
        const headline = typeof excerptOverride === 'string' ? excerptOverride : (post.excerpt || '');

        const result = await generateIntelImage({
            sourceUrl,
            animeTitle,
            headline,
            slug: post.slug || `post-${postId}`,
            // Preview mode skips the Storage upload and gets back a base64
            // data URL. Final renders (persist=true) upload as before.
            skipUpload: !persist,

            // All toggles + positions come from the request body. Defaults match
            // the auto-publish renderer: text + gradient + watermark all on.
            scale: settings.imageScale ?? 1,
            position: settings.imagePosition ?? { x: 0, y: 0 },
            applyText: settings.applyText ?? true,
            applyGradient: settings.applyGradient ?? true,
            applyWatermark: settings.applyWatermark ?? true,
            gradientPosition: settings.gradientPosition ?? 'bottom',
            gradientStrength: settings.gradientStrength,
            textScale: settings.textScale,
            textPosition: settings.textPosition,
            titleScale: settings.titleScale,
            captionScale: settings.captionScale,
            titleOffset: settings.titleOffset,
            captionOffset: settings.captionOffset,
            purpleWordIndices: settings.purpleWordIndices ?? [],
            watermarkPosition: settings.watermarkPosition ?? undefined,
            disableAutoScaling: !!settings.disableAutoScaling,

            classification: 'CLEAN',
            bypassSafety: true,
        });

        if (!result?.processedImage) {
            // Pull the specific reason the renderer set on its last failure.
            const why = (generateIntelImage as any).lastError as string | undefined;
            const sourceTail = sourceUrl.length > 80 ? `…${sourceUrl.slice(-80)}` : sourceUrl;
            return NextResponse.json(
                {
                    success: false,
                    error: why
                        ? `Render failed: ${why} (source: ${sourceTail})`
                        : `Render failed — source fetch likely blocked or non-image (source: ${sourceTail})`,
                    sourceUrl,
                },
                { status: 502 },
            );
        }

        if (!persist) {
            // Preview — return the base64 data URL, do not mutate the row.
            return NextResponse.json({
                success: true,
                image: result.processedImage,
                layout: result.layout,
                persisted: false,
            });
        }

        // Snapshot the exact settings used so we can reproduce this render
        // later (cleanup recovery, batch rebake, audit). Includes the source
        // URL so we know which background was used.
        const settingsSnapshot = {
            sourceUrl,
            applyText: settings.applyText ?? true,
            applyGradient: settings.applyGradient ?? true,
            applyWatermark: settings.applyWatermark ?? true,
            gradientPosition: settings.gradientPosition ?? 'bottom',
            gradientStrength: settings.gradientStrength ?? 1,
            textScale: settings.textScale,
            textPosition: settings.textPosition,
            titleScale: settings.titleScale,
            captionScale: settings.captionScale,
            titleOffset: settings.titleOffset,
            captionOffset: settings.captionOffset,
            purpleWordIndices: settings.purpleWordIndices ?? [],
            watermarkPosition: settings.watermarkPosition ?? null,
        };

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('posts')
            .update({ image: result.processedImage, image_settings: settingsSnapshot })
            .eq('id', postId)
            .select('id, image')
            .single();

        if (updateError) {
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            image: updated.image,
            layout: result.layout,
            persisted: true,
        });
    } catch (e: any) {
        console.error('[admin/render-post-image] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
