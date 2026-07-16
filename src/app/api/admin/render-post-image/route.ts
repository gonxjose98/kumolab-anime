import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateIntelImage } from '@/lib/engine/image-processor';
import { applySlides } from '@/lib/studio/slides';
import { getStudioActor, recordStudioActivity, type StudioActor } from '@/lib/auth/studio-actor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Renders or persists the overlay image for a post.
 *
 * Three modes:
 *   - persist=false (default) — preview only. Runs the renderer, returns
 *     a base64 data URL, does NOT touch Storage and does NOT write
 *     posts.image. Used by the editor's auto-render so the user can
 *     experiment freely without mutating the post until they hit Save.
 *   - persist=true + previewImage in body — promote-existing-bytes.
 *     The editor cached the last preview's base64; on Save it sends
 *     those exact bytes back. We decode + upload them as-is + write the
 *     settings snapshot. NO second render call. The bytes shown in the
 *     preview ARE the bytes that publish.
 *   - persist=true with no previewImage — fallback re-render path. Used
 *     when the editor hasn't had a chance to render yet (rare). Runs the
 *     renderer on the server side once.
 *
 * Settings + source URL get snapshotted into posts.image_settings so any
 * later re-render reproduces the user's approved choices.
 *
 * Attribution: both persist paths stamp image_settings.edited_by (+ email)
 * with the signed-in editor (INTERNAL label — nothing published reads it)
 * and log one studio_activity row (kind='photo', action='save') per Save.
 * Preview renders (persist=false) never touch either.
 */

// ── Carousel slide bake ────────────────────────────────────────
// When the persisted image_settings carry 2+ slides (a carousel), bake each
// slide's overlay image to a JPEG in Storage and stamp its public URL into
// slide.renderedUrl. JPEG because Meta's carousel image_url containers only
// accept JPEG. Distinct keys (`${slug}-slide-N.jpg`) so slides never clobber
// the single-image cover key (`${slug}-social.png`) or each other.
//
// Efficiency: the editor sends each slide's cached preview bytes as a
// transient `previewImage` data URL alongside the persisted fields. When
// present we promote those exact bytes (re-encoded to JPEG) — no server
// re-render, same WYSIWYG guarantee as the cover's promote-bytes path. Only
// slides without cached bytes fall back to a server-side render, keeping the
// common case well under the route's maxDuration.
//
// Mutates mergedSettings.slides in place. Returns slide 1's renderedUrl (the
// carousel cover, which becomes post.image) or null when this isn't a
// carousel / the cover bake failed (caller then keeps the legacy cover
// behavior). Per-slide failures are non-fatal: the slide's renderedUrl is
// cleared so the publisher's sourceUrl fallback kicks in predictably.
async function bakeCarouselSlides(
    slug: string,
    mergedSettings: Record<string, any>,
    rawSlidesPayload: unknown,
): Promise<string | null> {
    const slides = mergedSettings.slides;
    if (!Array.isArray(slides) || slides.length < 2) return null;

    // Filter the raw client payload with the SAME rule sanitizeSlides uses,
    // so indices line up with the sanitized slides — that's how each slide's
    // transient previewImage bytes are matched back up.
    const rawArr: any[] = Array.isArray(rawSlidesPayload)
        ? (rawSlidesPayload as any[]).filter(
            (sl: any) => sl && typeof sl === 'object' && typeof sl.sourceUrl === 'string')
        : [];

    let coverUrl: string | null = null;
    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const filename = `${slug}-slide-${i + 1}.jpg`;
        let publicUrl: string | null = null;
        try {
            const preview = rawArr[i]?.previewImage;
            const m = typeof preview === 'string'
                ? preview.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i)
                : null;
            if (m) {
                // Promote the editor's exact preview bytes, re-encoded JPEG.
                const sharp = (await import('sharp')).default;
                const jpeg = await sharp(Buffer.from(m[2], 'base64'))
                    .jpeg({ quality: 92 })
                    .toBuffer();
                const { error: upErr } = await supabaseAdmin.storage
                    .from('blog-images')
                    .upload(filename, jpeg, { contentType: 'image/jpeg', upsert: true });
                if (upErr) throw new Error(`slide upload failed: ${upErr.message}`);
                publicUrl = supabaseAdmin.storage.from('blog-images').getPublicUrl(filename).data.publicUrl;
            } else {
                // Fallback: server-side render from the slide's persisted
                // snapshot (same option mapping as the main render call).
                const st = (slide.settings && typeof slide.settings === 'object' ? slide.settings : {}) as Record<string, any>;
                const rendered = await generateIntelImage({
                    sourceUrl: slide.sourceUrl,
                    animeTitle: typeof slide.title === 'string' ? slide.title : '',
                    headline: typeof slide.excerpt === 'string' ? slide.excerpt : '',
                    slug,
                    outputFileName: filename,
                    outputFormat: 'jpeg',
                    scale: st.imageScale ?? 1,
                    position: st.imagePosition ?? { x: 0, y: 0 },
                    applyText: st.applyText ?? true,
                    applyGradient: st.applyGradient ?? true,
                    applyWatermark: st.applyWatermark ?? true,
                    gradientPosition: st.gradientPosition ?? 'bottom',
                    gradientStrength: st.gradientStrength,
                    titleScale: st.titleScale,
                    captionScale: st.captionScale,
                    titleOffset: st.titleOffset,
                    captionOffset: st.captionOffset,
                    purpleWordIndices: st.purpleWordIndices ?? [],
                    watermarkPosition: st.watermarkPosition ?? undefined,
                    classification: 'CLEAN',
                    bypassSafety: true,
                });
                if (!rendered?.processedImage) {
                    throw new Error((generateIntelImage as any).lastError || 'renderer returned null');
                }
                publicUrl = rendered.processedImage; // upload path returns the public URL
            }
        } catch (e: any) {
            console.error(`[admin/render-post-image] slide ${i + 1} bake failed for ${slug}:`, e?.message || e);
        }
        if (publicUrl) {
            // Version param busts CDN caches — the storage key is reused
            // across saves (upsert), same convention as post.image.
            const versioned = `${publicUrl}?v=${Date.now()}`;
            slide.renderedUrl = versioned;
            if (i === 0) coverUrl = versioned;
        } else {
            // A stale renderedUrl would show the PREVIOUS bake's overlay
            // text — drop it so the publisher's sourceUrl fallback applies.
            delete slide.renderedUrl;
        }
    }
    return coverUrl;
}

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
            previewImage,
            // Optional carousel snapshot from the editor. An explicit array
            // is authoritative (2+ entries → image_settings.slides, 0-1 →
            // legacy shape); absent = leave any existing slides untouched.
            slides: slidesPayload,
        } = body || {};

        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('id, slug, title, excerpt, image, source_url, youtube_video_id, image_settings')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return NextResponse.json({ success: false, error: fetchError?.message || 'Post not found' }, { status: 404 });
        }

        // Internal attribution — only the persist (Save) paths use it, so
        // preview renders never pay for the session read. Null for cookie-less
        // server/cron callers, which then simply skip the stamp + count.
        const actor: StudioActor | null = persist ? await getStudioActor() : null;

        // Promote-bytes path. When the editor cached the most recent
        // preview's base64 and sent it back on Save, we upload those
        // exact bytes — no second render. The image the user saw in the
        // preview is byte-for-byte the image that publishes.
        if (persist && typeof previewImage === 'string' && previewImage.startsWith('data:image/')) {
            const m = previewImage.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
            if (!m) {
                return NextResponse.json({ success: false, error: 'previewImage is not a valid base64 data URL' }, { status: 400 });
            }
            const contentType = m[1];
            const buffer = Buffer.from(m[2], 'base64');
            const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'png';
            const slug = post.slug || `post-${postId}`;
            const filename = `${slug}-social.${ext}`;

            const { error: uploadError } = await supabaseAdmin
                .storage
                .from('blog-images')
                .upload(filename, buffer, { contentType, upsert: true });
            if (uploadError) {
                return NextResponse.json({ success: false, error: `upload failed: ${uploadError.message}` }, { status: 500 });
            }
            const { data: { publicUrl } } = supabaseAdmin.storage.from('blog-images').getPublicUrl(filename);

            // Snapshot the settings the user approved with so any future
            // re-render reproduces the same picture if the bytes ever go
            // missing (cleanup recovery, batch rebake).
            const settingsSnapshot = {
                sourceUrl: sourceOverride || null,
                applyText: settings.applyText ?? false,
                applyGradient: settings.applyGradient ?? false,
                applyWatermark: settings.applyWatermark ?? false,
                gradientPosition: settings.gradientPosition ?? 'bottom',
                gradientStrength: settings.gradientStrength ?? 1,
                titleScale: settings.titleScale,
                captionScale: settings.captionScale,
                titleOffset: settings.titleOffset,
                captionOffset: settings.captionOffset,
                purpleWordIndices: settings.purpleWordIndices ?? [],
                watermarkPosition: settings.watermarkPosition ?? null,
                convertToReel: settings.convertToReel ?? false,
                imageScale: settings.imageScale ?? 1,
                imagePosition: settings.imagePosition ?? { x: 0, y: 0 },
            };

            // Merge over the existing image_settings so keys the editor
            // doesn't own (video_project, studio_edited_at, slides…) survive
            // a Save, then apply the carousel snapshot if one was sent.
            const mergedSettings: Record<string, any> = {
                ...(((post as any).image_settings as Record<string, any>) || {}),
                ...settingsSnapshot,
            };
            applySlides(mergedSettings, slidesPayload);
            if (actor) {
                mergedSettings.edited_by = actor.name;
                mergedSettings.edited_by_email = actor.email;
            }

            // Carousel (2+ slides): bake every slide to a JPEG and stamp
            // renderedUrl per slide. Slide 1's JPEG becomes post.image (the
            // cover). Non-carousel posts get null here and keep the exact
            // legacy cover write below.
            const carouselCoverUrl = await bakeCarouselSlides(slug, mergedSettings, slidesPayload);

            const { error: updateError } = await supabaseAdmin
                .from('posts')
                .update({ image: carouselCoverUrl || `${publicUrl}?v=${Date.now()}`, image_settings: mergedSettings })
                .eq('id', postId);
            if (updateError) {
                return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
            }
            // One explicit photo Save = one produced photo (autosaves hit a
            // different route and never insert activity rows).
            if (actor) await recordStudioActivity(actor, postId, 'photo', 'save');
            return NextResponse.json({ success: true, image: carouselCoverUrl || publicUrl, persisted: true, mode: 'promoted' });
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
            convertToReel: settings.convertToReel ?? false,
            imageScale: settings.imageScale ?? 1,
            imagePosition: settings.imagePosition ?? { x: 0, y: 0 },
        };

        // Same merge rules as the promote-bytes path: preserve keys the
        // editor doesn't own and honor an explicit carousel snapshot.
        const mergedSettings: Record<string, any> = {
            ...(((post as any).image_settings as Record<string, any>) || {}),
            ...settingsSnapshot,
        };
        applySlides(mergedSettings, slidesPayload);
        if (actor) {
            mergedSettings.edited_by = actor.name;
            mergedSettings.edited_by_email = actor.email;
        }

        // Same carousel bake as the promote-bytes path: on a 2+ slide save,
        // every slide gets a JPEG render + renderedUrl, and slide 1's JPEG
        // becomes post.image. Null for non-carousel posts (legacy write).
        const carouselCoverUrl = await bakeCarouselSlides(
            post.slug || `post-${postId}`, mergedSettings, slidesPayload);

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('posts')
            .update({ image: carouselCoverUrl || result.processedImage, image_settings: mergedSettings })
            .eq('id', postId)
            .select('id, image')
            .single();

        if (updateError) {
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }

        // Same rule as the promote-bytes branch: an explicit Save persist
        // counts as one produced photo.
        if (actor) await recordStudioActivity(actor, postId, 'photo', 'save');

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
