import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateIntelImage } from '@/lib/engine/image-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Renders the overlay image for a post and writes the result to posts.image.
 *
 * Settings can be passed in the request body (preferred) or fall through to
 * sensible defaults. The v2 schema dropped `background_image` and
 * `image_settings` columns; settings are now session-local (component state)
 * sent in the request, not persisted in the DB.
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
        } = body || {};

        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('id, slug, title, excerpt, image, source_url')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return NextResponse.json({ success: false, error: fetchError?.message || 'Post not found' }, { status: 404 });
        }

        const sourceUrl: string | null = sourceOverride || post.image || null;
        if (!sourceUrl) {
            return NextResponse.json({ success: false, error: 'Post has no image to render from. Set a source URL in the editor first.' }, { status: 400 });
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

            // All toggles + positions come from the request body. Defaults match
            // the auto-publish renderer: text + gradient + watermark all on.
            scale: settings.imageScale ?? 1,
            position: settings.imagePosition ?? { x: 0, y: 0 },
            applyText: settings.applyText ?? true,
            applyGradient: settings.applyGradient ?? true,
            applyWatermark: settings.applyWatermark ?? true,
            gradientPosition: settings.gradientPosition ?? 'bottom',
            textScale: settings.textScale ?? 1,
            textPosition: settings.textPosition,
            purpleWordIndices: settings.purpleWordIndices ?? [],
            watermarkPosition: settings.watermarkPosition,
            disableAutoScaling: !!settings.disableAutoScaling,

            classification: 'CLEAN',
            bypassSafety: true,
        });

        if (!result?.processedImage) {
            return NextResponse.json(
                { success: false, error: 'Image renderer returned null (source fetch likely failed — check the source URL is reachable)' },
                { status: 500 },
            );
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('posts')
            .update({ image: result.processedImage })
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
        });
    } catch (e: any) {
        console.error('[admin/render-post-image] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
