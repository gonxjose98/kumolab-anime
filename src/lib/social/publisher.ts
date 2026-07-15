import { BlogPost } from '@/types';
import { fetchYouTubeToBucket } from './trailer-fetcher';
import { publishToTikTok } from './tiktok-publisher';
import { publishToYouTubeShorts } from './youtube-publisher';
import { fetchWithTimeout } from '../http';
import { buildSocialHashtags } from './hashtags';
import { logError } from '../logging/structured-logger';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const IG_USER_ID = process.env.META_IG_ID;
const FB_PAGE_ID = '833836379820504';
// Facebook re-enable (Jose, 2026-07-11): under the global video-only policy the
// FB Page timeline went dormant → 0 reach. We now let high-quality image
// key-visuals through to Facebook ONLY (IG + Threads stay video-only), capped
// to keep it a deliberate trickle, not a firehose. Override via env, default 3.
const FB_IMAGE_DAILY_CAP = Number(process.env.FB_IMAGE_DAILY_CAP ?? 3);
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
// Threads "topic" (the "+ Community or topic" field in the composer). The API
// allows ONE topic_tag per post and drops the post into that topic's discovery
// feed, so it works like a pinned hashtag for reach. Default "Anime Threads",
// the 343K-member community (distinct from the smaller plain "anime" topic),
// to land every post in front of the largest anime audience. Override via env
// (no # symbol) without a redeploy. Empty string disables it.
const THREADS_TOPIC_TAG = (process.env.THREADS_TOPIC_TAG ?? 'Anime Threads').trim();

export interface SocialPublishResult {
    instagram_id?: string;
    instagram_url?: string;
    facebook_id?: string;
    facebook_url?: string;
    threads_id?: string;
    threads_url?: string;
    tiktok_publish_id?: string;
    tiktok_url?: string;
    youtube_video_id?: string;
    youtube_url?: string;
    staged_video_url?: string;
}

/**
 * Publishes a post to all applicable social platforms.
 *
 * Platform rules:
 *   - Instagram: every published post.
 *   - Facebook Page: every published post — direct Graph API call to the
 *     KumoLab Page (replaces the old Meta Suite cross-post path, which was
 *     unreliable). The IG cross-post toggle is left OFF so we don't double-post.
 *   - Threads: every published post — direct Threads API call. Replaces
 *     the IG → Threads cross-post toggle. Long-lived 60-day token is
 *     refreshed weekly by the refresh-threads-token cron worker.
 *   - TikTok + YouTube Shorts: only for TRAILER_DROP claims whose source_url is a
 *     YouTube video. We download the trailer to the blog-videos bucket, then hand
 *     TikTok + YT the public bucket URL.
 *
 * Each publisher no-ops if its credentials aren't set, so cutover works before
 * TikTok approval / YT OAuth is fully wired.
 */
export async function publishToSocials(post: BlogPost): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};

    if (process.env.AUTO_PUBLISH_SOCIALS !== 'true') {
        await logError({
            source: 'publisher.ig',
            errorMessage: 'AUTO_PUBLISH_SOCIALS is not "true" — skipping broadcast',
            context: { post_id: (post as any).id, slug: post.slug },
        });
        return result;
    }

    // ── 0. Per-post lock to prevent concurrent publishes ───────
    // Without this, two simultaneous calls (e.g. operator clicks
    // republish twice, or auto-retry fires while a manual retry is
    // in flight, or Cloudflare 524's the curl but Vercel keeps
    // running and the operator triggers again) all create their
    // OWN brand-new IG/FB/Threads posts. The DB only remembers the
    // last set of IDs, but the platforms each show 2-3 duplicates.
    //
    // Lock TTL = 10 min covers the worst-case full publish path
    // (worker cold start + 60s download + ffmpeg + 3-platform upload
    // with status polling). If a publish actually takes longer, the
    // lock expires and a follow-up retry can proceed.
    const postId = (post as any).id;
    if (postId) {
        const { supabaseAdmin } = await import('../supabase/admin');
        const lockKey = `publish:${postId}`;
        const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        // Sweep stale locks first so a crashed earlier publish doesn't
        // block forever.
        await supabaseAdmin.from('worker_locks').delete().eq('lock_key', lockKey).lt('expires_at', new Date().toISOString());
        const { error: lockErr } = await supabaseAdmin.from('worker_locks').insert({
            lock_key: lockKey,
            locked_by: `publishToSocials(${post.slug})`,
            locked_at: new Date().toISOString(),
            expires_at: tenMinFromNow,
        });
        if (lockErr) {
            // Conflict on lock_key PK = another publish is in flight
            await supabaseAdmin.from('action_logs').insert({
                action: 'social_publish_skipped',
                actor: 'system',
                entity_type: 'post',
                entity_id: postId,
                entity_title: post.title,
                reason: 'Concurrent publish already in flight — skipping to avoid duplicate posts',
                details: { slug: post.slug, lock_key: lockKey },
            }).then(() => {}, () => {});
            (result as any).skipped_reason = 'lock_held';
            return result;
        }
    }

    // Wrap rest of body so we always release the lock
    try {
        return await publishToSocialsInner(post, result);
    } finally {
        if (postId) {
            const { supabaseAdmin } = await import('../supabase/admin');
            await supabaseAdmin.from('worker_locks').delete().eq('lock_key', `publish:${postId}`);
        }
    }
}

async function publishToSocialsInner(post: BlogPost, result: SocialPublishResult): Promise<SocialPublishResult> {

    // ── 0b. Instagram-carousel branch ──────────────────────────
    // A post whose image_settings carry 2+ slides is an operator-built
    // carousel (the multi-slide photo editor is the ONLY thing that writes
    // slides, and only with >=2 entries — the auto-pipeline never does).
    // Carousels are image sets by construction, so they bypass the video
    // staging + video-only policy below entirely:
    //   • Instagram — publish the full carousel (per-slide baked JPEGs).
    //   • Facebook  — slide 1 (the cover) via the existing /photos path;
    //     post.image IS slide 1's baked render.
    //   • Threads   — TODO: Threads carousels need their own children/parent
    //     container flow; deliberately not wired yet. Skipping matches the
    //     status quo (the video-only policy already kept image posts off
    //     Threads), so nothing regresses.
    // For every other post (no slides key, or a degenerate single entry)
    // this whole block is a no-op and the flow below is byte-identical.
    const carouselSlides: Array<{ sourceUrl?: string; renderedUrl?: string }> =
        Array.isArray((post as any).image_settings?.slides)
            ? (post as any).image_settings.slides
            : [];
    if (carouselSlides.length >= 2) {
        // Prefer each slide's baked overlay JPEG (renderedUrl, written on
        // Save); fall back to the raw background (sourceUrl) so a slide whose
        // bake failed still ships as a picture rather than sinking the set.
        const slideImageUrls = carouselSlides
            .map(sl => (typeof sl?.renderedUrl === 'string' && sl.renderedUrl)
                ? sl.renderedUrl
                : (typeof sl?.sourceUrl === 'string' ? sl.sourceUrl : ''))
            .filter(u => /^https?:\/\//i.test(u));

        if (slideImageUrls.length >= 2) {
            if (META_ACCESS_TOKEN && IG_USER_ID) {
                try {
                    const igResult = await publishToInstagramCarousel(post, slideImageUrls);
                    Object.assign(result, igResult);
                } catch (e: any) {
                    await logError({
                        source: 'publisher.ig',
                        errorMessage: `IG carousel publish threw: ${e?.message || e}`,
                        stackTrace: e?.stack,
                        context: { post_id: (post as any).id, slug: post.slug, title: post.title },
                    });
                }
            } else {
                await logError({
                    source: 'publisher.ig',
                    errorMessage: 'Meta credentials missing — META_ACCESS_TOKEN or META_IG_ID not set',
                    context: { has_token: !!META_ACCESS_TOKEN, has_ig_id: !!IG_USER_ID },
                });
            }

            if (META_ACCESS_TOKEN) {
                try {
                    const fbResult = await publishToFacebookPage(post, null);
                    Object.assign(result, fbResult);
                } catch (e: any) {
                    await logError({
                        source: 'publisher.fb',
                        errorMessage: `FB publish threw: ${e?.message || e}`,
                        stackTrace: e?.stack,
                        context: { post_id: (post as any).id, slug: post.slug, title: post.title },
                    });
                }
            }
        } else {
            await logError({
                source: 'publisher.ig.carousel',
                errorMessage: `Carousel post has ${slideImageUrls.length} usable slide image URL(s) — need 2+; skipping socials`,
                context: { post_id: (post as any).id, slug: post.slug, slide_count: carouselSlides.length },
            });
        }

        // Persist the platform ids to the post IMMEDIATELY, merged into
        // social_ids. A carousel publish (N child polls + parent poll) can run
        // long enough that the function is killed before the caller's
        // persistSocialIds runs — as happened on the first live test, which
        // posted to IG/FB but left social_ids empty. Writing here as soon as we
        // have the ids makes persistence independent of the caller surviving.
        try {
            const { supabaseAdmin } = await import('../supabase/admin');
            const ids: Record<string, any> = {};
            if (result.instagram_id) ids.instagram_id = result.instagram_id;
            if (result.instagram_url) ids.instagram_url = result.instagram_url;
            if (result.facebook_id) ids.facebook_id = result.facebook_id;
            if (result.facebook_url) ids.facebook_url = result.facebook_url;
            if (Object.keys(ids).length > 0) {
                const { data: existing } = await supabaseAdmin
                    .from('posts').select('social_ids').eq('id', (post as any).id).maybeSingle();
                await supabaseAdmin
                    .from('posts')
                    .update({ social_ids: { ...((existing?.social_ids as any) || {}), ...ids } })
                    .eq('id', (post as any).id);
            }
        } catch (e: any) {
            await logError({
                source: 'publisher.ig.carousel',
                errorMessage: `Carousel social_ids persist failed: ${e?.message || e}`,
                context: { post_id: (post as any).id, slug: post.slug },
            });
        }

        // Operational trail, mirroring the other terminal branches.
        {
            const { supabaseAdmin } = await import('../supabase/admin');
            const published = !!(result.instagram_id || result.facebook_id);
            await supabaseAdmin.from('action_logs').insert({
                action: published ? 'social_publish_carousel' : 'social_publish_skipped',
                actor: 'system',
                entity_type: 'post',
                entity_id: (post as any).id,
                entity_title: post.title,
                reason: published
                    ? 'Carousel post → IG carousel + FB cover photo (Threads carousel not wired yet)'
                    : 'Carousel post — IG/FB publish did not produce an id (see error_logs)',
                details: {
                    slug: post.slug,
                    slide_count: carouselSlides.length,
                    usable_urls: slideImageUrls.length,
                    ig_id: result.instagram_id ?? null,
                    fb_id: result.facebook_id ?? null,
                },
            }).then(() => {}, () => {});
        }
        return result;
    }

    // ── 1. Stage YouTube video FIRST (any YouTube source) ─────
    // Per Jose's directive: if the post's source is a YouTube video,
    // the video itself is what should ship to social — not a screenshot
    // of the thumbnail. We expanded this from TRAILER_DROP-only to ALL
    // YouTube-sourced claims so season confirms / date announces / etc.
    // also publish as Reels when there's a real video underlying them.
    // Same staged URL feeds TikTok + YT Shorts below.
    const claim = (post as any).claimType || (post as any).claim_type;
    const sourceUrl = (post as any).source_url || '';
    // Resolve the underlying trailer. Posts detected from an aggregator
    // (e.g. AnimeNewsNetwork) carry the article link in source_url but the
    // real YouTube trailer in youtube_url / youtube_video_id. Without this
    // fallback those posts look "image-only" and get skipped by the
    // video-only policy below, throwing away a video we already have.
    const youtubeFieldUrl =
        (post as any).youtube_url ||
        ((post as any).youtube_video_id
            ? `https://youtube.com/watch?v=${(post as any).youtube_video_id}`
            : '');
    const trailerUrl = /youtube\.com|youtu\.be/.test(sourceUrl)
        ? sourceUrl
        : youtubeFieldUrl;
    const isYouTubeSource = /youtube\.com|youtu\.be/.test(trailerUrl);

    // Manual uploads come pre-staged: the operator already pushed the
    // MP4 to our blog-videos bucket via the admin upload flow, and
    // attached the public URL on the post object. Skip the worker
    // fetch entirely for these.
    //
    // Two pre-staged paths:
    //   • _prestagedVideoUrl   — in-memory side channel (upload-and-publish
    //                            'publish' mode, fires immediately so the
    //                            URL never needs to round-trip the DB)
    //   • social_ids.staged_video_url — persisted on the row, so the
    //                            scheduled-publish cron can find it after
    //                            approve→cron crosses a process boundary.
    //                            Set by import-from-url and by upload-and-
    //                            publish 'publish' mode's writeback. Reading
    //                            it here lets imported videos publish without
    //                            an in-memory hand-off.
    let stagedVideoUrl: string | null =
        (post as any)._prestagedVideoUrl ||
        (post as any).social_ids?.staged_video_url ||
        null;
    if (stagedVideoUrl) {
        result.staged_video_url = stagedVideoUrl;
    } else if (
        post.image &&
        !isYouTubeSource &&
        (post as any).type !== 'DROP' &&
        // OPT-IN: only convert when the operator explicitly enabled it
        // for this specific post (image_settings.convertToReel === true).
        // Default OFF — Jose's directive 2026-05-06.
        ((post as any).image_settings?.convertToReel === true)
    ) {
        // Image post → 12s Ken-Burns slow-zoom Reel. Operator-enabled
        // per-post via the editor. Falls through to image flow if FFmpeg
        // fails — but logs the failure so we can debug.
        try {
            const { imageToReel, fetchImageBuffer } = await import('./image-to-video');
            const { supabaseAdmin } = await import('../supabase/admin');
            const buf = await fetchImageBuffer(post.image);
            if (!buf) {
                await logError({
                    source: 'publisher.image-to-reel',
                    errorMessage: `Could not fetch source image: ${post.image}`,
                    context: { post_id: (post as any).id, slug: post.slug, image: post.image },
                }).catch(() => {});
                throw new Error('image fetch returned null');
            }
            console.log(`[Publisher] Image-to-Reel: fetched ${buf.length} bytes from ${post.image}`);
            const reel = await imageToReel(buf, { direction: 'in' });
            if (!reel.buffer || reel.buffer.length === 0) {
                await logError({
                    source: 'publisher.image-to-reel',
                    errorMessage: `FFmpeg conversion failed (exit ${reel.exitCode}): ${reel.stderr.slice(-800) || 'no stderr'}`,
                    context: {
                        post_id: (post as any).id,
                        slug: post.slug,
                        source_bytes: buf.length,
                        ffmpeg_args: reel.args,
                        exit_code: reel.exitCode,
                    },
                }).catch(() => {});
                throw new Error('ffmpeg produced no output');
            }
            const bucketPath = `${post.slug}-image-reel.mp4`;
            const { error: upErr } = await supabaseAdmin.storage
                .from('blog-videos')
                .upload(bucketPath, reel.buffer, { contentType: 'video/mp4', upsert: true });
            if (upErr) {
                await logError({
                    source: 'publisher.image-to-reel',
                    errorMessage: `Bucket upload failed: ${upErr.message}`,
                    context: { post_id: (post as any).id, slug: post.slug, bytes: reel.buffer.length },
                }).catch(() => {});
                throw new Error(`upload failed: ${upErr.message}`);
            }
            const { data: { publicUrl } } = supabaseAdmin.storage.from('blog-videos').getPublicUrl(bucketPath);
            stagedVideoUrl = publicUrl;
            result.staged_video_url = publicUrl;
            console.log(`[Publisher] Converted still image to ${(reel.buffer.length / 1024 / 1024).toFixed(1)} MB Reel for ${post.slug}`);
        } catch (e: any) {
            console.warn(`[Publisher] Image-to-Reel failed for ${post.slug}, falling back to image post:`, e?.message || e);
            // The detailed error already went to error_logs above; this
            // catch just unwinds to the image flow.
        }
    } else if (isYouTubeSource) {
        const staged = await fetchYouTubeToBucket(trailerUrl, post.slug);
        if (staged) {
            stagedVideoUrl = staged.bucket_url;
            result.staged_video_url = staged.bucket_url;
        } else {
            // Per Jose's directive (2026-05-05): when a post is sourced
            // from a YouTube video and the video fetch fails, do NOT
            // fall back to publishing the static thumbnail. Skip socials
            // entirely. The post still exists on the website. Operator
            // can manually republish via /api/cron?worker=republish-social
            // once the underlying issue is resolved.
            //
            // This is intentional behavior, not a fault — log to
            // action_logs (operational), not error_logs.
            const { supabaseAdmin } = await import('../supabase/admin');
            await supabaseAdmin.from('action_logs').insert({
                action: 'social_publish_skipped',
                actor: 'system',
                entity_type: 'post',
                entity_id: (post as any).id,
                entity_title: post.title,
                reason: 'YouTube video fetch failed — no screenshot fallback',
                details: { slug: post.slug, source_url: sourceUrl, trailer_url: trailerUrl },
            }).then(() => {}, () => {});
            (result as any).skipped_reason = 'video_fetch_failed';
            return result;
        }
    }

    // ── 1c. Video-only social policy ───────────────────────────
    // CHANGE FOLLOWING IG ANALYSIS RUN 3 (2026-06-06). See REVIEW-CHANGELOG.md.
    //
    // Three consecutive account reviews now agree image posts are dead
    // weight on social: Run 3 measured 61 image posts at a 16-view median
    // with ZERO ever clearing the mid (1k+) tier, while every breakout is a
    // video Reel. So we no longer broadcast image-only posts to IG/FB/Threads.
    // If nothing was staged above (no YouTube source, no operator
    // image-to-Reel opt-in, no pre-staged MP4), the post still lives on the
    // website — we just skip the social broadcast.
    //
    // Intentional, not a fault → action_logs (operational), not error_logs.
    // Mirrors the existing "no screenshot fallback" directive.
    //
    // EXCEPTION (Jose, 2026-07-11): Facebook is re-enabled for image
    // key-visuals. IG + Threads stay video-only (image posts proved dead
    // weight there), but a capped trickle of NEW_KEY_VISUAL images keeps the
    // FB Page timeline alive instead of starving it to 0 reach. Key-visuals
    // already carry the pipeline's source/quality guardrails, so the only
    // extra gate here is a real (non-placeholder) image + the daily cap.
    if (!stagedVideoUrl) {
        const { supabaseAdmin } = await import('../supabase/admin');
        const isKeyVisual = String(claim || '').toUpperCase() === 'NEW_KEY_VISUAL';
        const hasRealImage = !!post.image && !String(post.image).includes('placeholder');
        let didFb = false;

        if (META_ACCESS_TOKEN && isKeyVisual && hasRealImage && await fbImagePostsUnderCap(FB_IMAGE_DAILY_CAP)) {
            try {
                const fbResult = await publishToFacebookPage(post, null);
                Object.assign(result, fbResult);
                didFb = !!result.facebook_id;
            } catch (e: any) {
                await logError({
                    source: 'publisher.fb',
                    errorMessage: `FB key-visual publish threw: ${e?.message || e}`,
                    stackTrace: e?.stack,
                    context: { post_id: (post as any).id, slug: post.slug, title: post.title },
                });
            }
        }

        await supabaseAdmin.from('action_logs').insert({
            action: didFb ? 'social_publish_partial' : 'social_publish_skipped',
            actor: 'system',
            entity_type: 'post',
            entity_id: (post as any).id,
            entity_title: post.title,
            reason: didFb
                ? 'Image key-visual → Facebook only (IG/Threads stay video-only)'
                : 'Image-only post — video-only for IG/Threads; FB skipped (not a key-visual, no image, or daily cap reached)',
            details: { slug: post.slug, claim_type: claim, type: (post as any).type, fb_posted: didFb },
        }).then(() => {}, () => {});
        (result as any).skipped_reason = didFb ? 'image_fb_keyvisual_only' : 'image_only_video_only_policy';
        return result;
    }

    // ── 2. Instagram ───────────────────────────────────────────
    // For TRAILER_DROP with a staged video, use the Reels API. Otherwise
    // (visual reveal, season confirm, etc.) keep the existing image flow.
    if (META_ACCESS_TOKEN && IG_USER_ID) {
        try {
            const igResult = await publishToInstagram(post, stagedVideoUrl);
            Object.assign(result, igResult);
        } catch (e: any) {
            await logError({
                source: 'publisher.ig',
                errorMessage: `IG publish threw: ${e?.message || e}`,
                stackTrace: e?.stack,
                context: { post_id: (post as any).id, slug: post.slug, title: post.title },
            });
        }
    } else {
        await logError({
            source: 'publisher.ig',
            errorMessage: 'Meta credentials missing — META_ACCESS_TOKEN or META_IG_ID not set',
            context: { has_token: !!META_ACCESS_TOKEN, has_ig_id: !!IG_USER_ID },
        });
    }

    // ── 3. Facebook Page (direct, no Meta Suite cross-post) ────
    if (META_ACCESS_TOKEN) {
        try {
            const fbResult = await publishToFacebookPage(post, stagedVideoUrl);
            Object.assign(result, fbResult);
        } catch (e: any) {
            await logError({
                source: 'publisher.fb',
                errorMessage: `FB publish threw: ${e?.message || e}`,
                stackTrace: e?.stack,
                context: { post_id: (post as any).id, slug: post.slug, title: post.title },
            });
        }
    }

    // ── 4. Threads (direct Threads API) ────────────────────────
    if (THREADS_ACCESS_TOKEN && THREADS_USER_ID) {
        try {
            const threadsResult = await publishToThreads(post, stagedVideoUrl);
            Object.assign(result, threadsResult);
        } catch (e: any) {
            await logError({
                source: 'publisher.threads',
                errorMessage: `Threads publish threw: ${e?.message || e}`,
                stackTrace: e?.stack,
                context: { post_id: (post as any).id, slug: post.slug, title: post.title },
            });
        }
    }

    // ── 5. Video platforms for TRAILER_DROP only ───────────────
    if (stagedVideoUrl) {
        // TikTok
        const tiktok = await publishToTikTok({
            title: post.title,
            videoUrl: stagedVideoUrl,
        });
        if (tiktok.tiktok_publish_id) result.tiktok_publish_id = tiktok.tiktok_publish_id;
        if (tiktok.tiktok_url) result.tiktok_url = tiktok.tiktok_url;
        if (tiktok.skipped) console.log('[Social] TikTok:', tiktok.skipped);
        if (tiktok.error) console.error('[Social] TikTok error:', tiktok.error);

        // YouTube Shorts — EDITED / ORIGINAL ONLY. Unlike every other platform,
        // reposting someone else's raw video to YouTube risks copyright strikes
        // and channel suspension, so raw reposts (imported clips), auto-fetched
        // trailers, and auto image-to-reel conversions must NEVER reach YouTube.
        // A post counts as edited iff it carries a Studio video project (it was
        // assembled/trimmed in the editor) — the same signal the Studio admin
        // uses for "edited". This is defense in depth alongside the
        // YOUTUBE_AUTO_PUBLISH env gate inside publishToYouTubeShorts.
        const isStudioEdited = !!(post as any).image_settings?.video_project;
        if (isStudioEdited) {
            const yt = await publishToYouTubeShorts({
                title: post.title,
                description: post.content,
                videoUrl: stagedVideoUrl,
            });
            if (yt.youtube_video_id) result.youtube_video_id = yt.youtube_video_id;
            if (yt.youtube_url) result.youtube_url = yt.youtube_url;
            if (yt.skipped) console.log('[Social] YT Shorts:', yt.skipped);
            if (yt.error) console.error('[Social] YT Shorts error:', yt.error);
        } else {
            console.log('[Social] YT Shorts: skipped (not a Studio-edited video)');
        }
    }

    return result;
}

// ── Instagram publisher (split out for readability) ─────────────
//
// When `stagedVideoUrl` is provided we use the **Reels** flow
// (media_type=REELS, video_url=...). Otherwise we use the image flow
// (image_url=post.image). The Reels container takes longer to ingest, so
// we poll the container's `status_code` until FINISHED before publishing
// instead of using the old fixed 4s sleep.
async function publishToInstagram(post: BlogPost, stagedVideoUrl: string | null = null): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!IG_USER_ID || !META_ACCESS_TOKEN) return result;

    const isReels = !!stagedVideoUrl;
    const lead = (post as any).excerpt || post.content?.substring(0, 300) || '';
    const hashtags = buildSocialHashtags({
        title: post.title,
        claim_type: (post as any).claimType || (post as any).claim_type,
        anime_id: post.anime_id,
        override: (post as any).hashtags,
    }).join(' ');
    const caption = `${post.title}\n\n${lead}\n\n${hashtags}`.substring(0, 2200);

    try {
        const containerUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`;
        const containerParams = isReels
            ? new URLSearchParams({
                media_type: 'REELS',
                video_url: stagedVideoUrl!,
                caption,
                share_to_feed: 'true',
                access_token: META_ACCESS_TOKEN || '',
            })
            : new URLSearchParams({
                image_url: post.image || '',
                caption,
                access_token: META_ACCESS_TOKEN || '',
            });

        const containerRes = await fetchWithTimeout(`${containerUrl}?${containerParams}`, { method: 'POST' }, 20_000);
        const containerData = await containerRes.json();

        if (!containerData.id) {
            const meta = containerData?.error || {};
            const reason = meta.code === 190
                ? `IG token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                : `IG ${isReels ? 'Reels' : 'image'} container creation failed: ${meta.message || JSON.stringify(containerData).substring(0, 300)}`;
            await logError({
                source: 'publisher.ig.container',
                errorMessage: reason,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    meta_subcode: meta.error_subcode,
                    media_type: isReels ? 'REELS' : 'IMAGE',
                },
            });
            return result;
        }

        // Wait for container ingest. Image containers are ready almost
        // instantly; Reels containers need IG to actually fetch + transcode
        // the video, which can take 10–60s. We poll status_code (FINISHED |
        // ERROR | EXPIRED | IN_PROGRESS | PUBLISHED) up to ~60s for Reels
        // and 6s for image.
        // Reels can take 60–150s to transcode on IG's side. The old 60s
        // ceiling was timing out posts that ultimately would have finished
        // (2 misses in one day on 2026-05-08). The cron route's
        // maxDuration is 300s, so 180s here still leaves room for FB +
        // Threads after IG.
        const maxWaitMs = isReels ? 180_000 : 6_000;
        const pollIntervalMs = isReels ? 5_000 : 2_000;
        const start = Date.now();
        let finalStatus: string | null = null;
        while (Date.now() - start < maxWaitMs) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            const statusRes = await fetchWithTimeout(
                `https://graph.facebook.com/v18.0/${containerData.id}?fields=status_code&access_token=${encodeURIComponent(META_ACCESS_TOKEN || '')}`,
                { method: 'GET' },
                10_000,
            );
            const statusData = await statusRes.json().catch(() => ({}));
            finalStatus = statusData.status_code || null;
            if (finalStatus === 'FINISHED') break;
            if (finalStatus === 'ERROR' || finalStatus === 'EXPIRED') {
                await logError({
                    source: 'publisher.ig.container',
                    errorMessage: `IG ${isReels ? 'Reels' : 'image'} container ingest ${finalStatus}: ${JSON.stringify(statusData).substring(0, 300)}`,
                    context: {
                        post_slug: post.slug,
                        post_title: post.title,
                        media_type: isReels ? 'REELS' : 'IMAGE',
                        container_id: containerData.id,
                    },
                });
                return result;
            }
        }
        if (finalStatus !== 'FINISHED') {
            // For image posts the legacy 4s sleep was usually enough — fall
            // through and try publishing anyway. For Reels, give up cleanly.
            if (isReels) {
                await logError({
                    source: 'publisher.ig.container',
                    errorMessage: `IG Reels container did not reach FINISHED in ${maxWaitMs / 1000}s (last status: ${finalStatus || 'unknown'})`,
                    context: {
                        post_slug: post.slug,
                        post_title: post.title,
                        container_id: containerData.id,
                    },
                });
                return result;
            }
        }

        const publishUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish`;
        const publishParams = new URLSearchParams({
            creation_id: containerData.id,
            access_token: META_ACCESS_TOKEN || '',
        });

        const publishRes = await fetchWithTimeout(`${publishUrl}?${publishParams}`, { method: 'POST' }, 15_000);
        const publishData = await publishRes.json();

        if (publishData.id) {
            result.instagram_id = publishData.id;
            result.instagram_url = `https://instagram.com/p/${publishData.id}`;
            console.log(`✅ [Instagram] Published ${isReels ? 'Reels' : 'image'}: ${publishData.id} (FB handled by direct post; Threads via Meta Suite IG cross-post)`);
        } else {
            const meta = publishData?.error || {};
            const reason = meta.code === 190
                ? `IG token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                : `IG ${isReels ? 'Reels' : 'image'} publish phase failed: ${meta.message || JSON.stringify(publishData).substring(0, 300)}`;
            await logError({
                source: 'publisher.ig.publish',
                errorMessage: reason,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    meta_subcode: meta.error_subcode,
                    media_type: isReels ? 'REELS' : 'IMAGE',
                },
            });
        }
    } catch (e: any) {
        await logError({
            source: 'publisher.ig.publish',
            errorMessage: `IG fetch/publish threw: ${e?.message || e}`,
            stackTrace: e?.stack,
            context: { post_slug: post.slug, post_title: post.title, media_type: isReels ? 'REELS' : 'IMAGE' },
        });
    }

    return result;
}

// ── Instagram carousel publisher ────────────────────────────────
//
// Publishes a 2-10 image carousel:
//   1. one child container per slide (image_url + is_carousel_item=true) —
//      the URLs must be public JPEGs (Meta rejects PNG for image_url),
//      which is why the Save flow bakes each slide as `${slug}-slide-N.jpg`;
//   2. poll every child to FINISHED;
//   3. parent container (media_type=CAROUSEL, children=comma-joined ids,
//      caption = the same caption the single-image/Reels flow builds);
//   4. poll the parent, then media_publish it.
//
// New endpoints use Graph v22.0 per current Meta docs; the existing
// single-image/Reels calls above are deliberately left on their pinned
// version, untouched.
const IG_CAROUSEL_GRAPH_BASE = 'https://graph.facebook.com/v22.0';

// Poll an IG media container's status_code until FINISHED, a terminal
// failure (ERROR/EXPIRED), or timeout. Returns the last observed status
// (null if it never became readable). Same poll pattern as the Reels flow.
async function pollIgCarouselContainer(
    containerId: string,
    maxWaitMs: number,
    pollIntervalMs: number,
): Promise<string | null> {
    const start = Date.now();
    let finalStatus: string | null = null;
    while (Date.now() - start < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        const statusRes = await fetchWithTimeout(
            `${IG_CAROUSEL_GRAPH_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(META_ACCESS_TOKEN || '')}`,
            { method: 'GET' },
            10_000,
        );
        const statusData = await statusRes.json().catch(() => ({}));
        finalStatus = statusData.status_code || null;
        if (finalStatus === 'FINISHED' || finalStatus === 'ERROR' || finalStatus === 'EXPIRED') break;
    }
    return finalStatus;
}

export async function publishToInstagramCarousel(
    post: BlogPost,
    slideImageUrls: string[],
): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!IG_USER_ID || !META_ACCESS_TOKEN) return result;

    // Meta allows 2-10 children per carousel — clamp to the first 10 and
    // refuse to build a "carousel" of fewer than 2.
    const urls = (slideImageUrls || [])
        .filter(u => typeof u === 'string' && /^https?:\/\//i.test(u))
        .slice(0, 10);
    if (urls.length < 2) {
        await logError({
            source: 'publisher.ig.carousel',
            errorMessage: `IG carousel needs 2-10 image URLs, got ${urls.length}`,
            context: { post_slug: post.slug, post_title: post.title, provided: slideImageUrls?.length ?? 0 },
        });
        return result;
    }

    // Identical caption to the single-image/Reels flow (publishToInstagram).
    const lead = (post as any).excerpt || post.content?.substring(0, 300) || '';
    const hashtags = buildSocialHashtags({
        title: post.title,
        claim_type: (post as any).claimType || (post as any).claim_type,
        anime_id: post.anime_id,
        override: (post as any).hashtags,
    }).join(' ');
    const caption = `${post.title}\n\n${lead}\n\n${hashtags}`.substring(0, 2200);

    try {
        // Phase 1: one child container per slide.
        const childIds: string[] = [];
        for (let i = 0; i < urls.length; i++) {
            const childParams = new URLSearchParams({
                image_url: urls[i],
                is_carousel_item: 'true',
                access_token: META_ACCESS_TOKEN,
            });
            const childRes = await fetchWithTimeout(
                `${IG_CAROUSEL_GRAPH_BASE}/${IG_USER_ID}/media?${childParams}`,
                { method: 'POST' },
                20_000,
            );
            const childData = await childRes.json();
            if (!childData.id) {
                const meta = childData?.error || {};
                const reason = meta.code === 190
                    ? `IG token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                    : `IG carousel child ${i + 1}/${urls.length} container creation failed: ${meta.message || JSON.stringify(childData).substring(0, 300)}`;
                await logError({
                    source: 'publisher.ig.carousel',
                    errorMessage: reason,
                    context: {
                        post_slug: post.slug,
                        post_title: post.title,
                        meta_code: meta.code,
                        meta_subcode: meta.error_subcode,
                        slide_index: i + 1,
                        image_url: urls[i],
                    },
                });
                return result;
            }
            childIds.push(childData.id);
        }

        // Phase 2: every child must reach FINISHED before the parent can be
        // assembled. Image ingest is normally seconds; 30s each is generous.
        for (let i = 0; i < childIds.length; i++) {
            const status = await pollIgCarouselContainer(childIds[i], 15_000, 2_000);
            if (status !== 'FINISHED') {
                await logError({
                    source: 'publisher.ig.carousel',
                    errorMessage: `IG carousel child ${i + 1}/${childIds.length} ingest did not FINISH (last status: ${status || 'unknown'})`,
                    context: {
                        post_slug: post.slug,
                        post_title: post.title,
                        container_id: childIds[i],
                        slide_index: i + 1,
                    },
                });
                return result;
            }
        }

        // Phase 3: parent CAROUSEL container referencing the children.
        const parentParams = new URLSearchParams({
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            caption,
            access_token: META_ACCESS_TOKEN,
        });
        const parentRes = await fetchWithTimeout(
            `${IG_CAROUSEL_GRAPH_BASE}/${IG_USER_ID}/media?${parentParams}`,
            { method: 'POST' },
            20_000,
        );
        const parentData = await parentRes.json();
        if (!parentData.id) {
            const meta = parentData?.error || {};
            await logError({
                source: 'publisher.ig.carousel',
                errorMessage: `IG carousel parent container creation failed: ${meta.message || JSON.stringify(parentData).substring(0, 300)}`,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    meta_subcode: meta.error_subcode,
                    children: childIds.length,
                },
            });
            return result;
        }

        // Phase 4: wait for the parent to assemble. Terminal failure gives
        // up; a timeout still attempts the publish (mirrors the image flow's
        // "the legacy sleep was usually enough" behavior).
        const parentStatus = await pollIgCarouselContainer(parentData.id, 30_000, 3_000);
        if (parentStatus === 'ERROR' || parentStatus === 'EXPIRED') {
            await logError({
                source: 'publisher.ig.carousel',
                errorMessage: `IG carousel parent container ingest ${parentStatus}`,
                context: { post_slug: post.slug, post_title: post.title, container_id: parentData.id },
            });
            return result;
        }

        // Phase 5: publish.
        const publishParams = new URLSearchParams({
            creation_id: parentData.id,
            access_token: META_ACCESS_TOKEN,
        });
        const publishRes = await fetchWithTimeout(
            `${IG_CAROUSEL_GRAPH_BASE}/${IG_USER_ID}/media_publish?${publishParams}`,
            { method: 'POST' },
            15_000,
        );
        const publishData = await publishRes.json();

        if (publishData.id) {
            result.instagram_id = publishData.id;
            // The numeric media id is NOT a valid /p/ URL (IG uses a shortcode),
            // so fetch the real permalink. Best-effort — fall back to the profile.
            try {
                const permRes = await fetchWithTimeout(
                    `${IG_CAROUSEL_GRAPH_BASE}/${publishData.id}?fields=permalink&access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`,
                    { method: 'GET' },
                    10_000,
                );
                const permData = await permRes.json().catch(() => ({}));
                result.instagram_url = permData.permalink || 'https://instagram.com/kumolabanime';
            } catch {
                result.instagram_url = 'https://instagram.com/kumolabanime';
            }
            console.log(`✅ [Instagram] Published carousel (${childIds.length} slides): ${publishData.id}`);
        } else {
            const meta = publishData?.error || {};
            const reason = meta.code === 190
                ? `IG token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                : `IG carousel publish phase failed: ${meta.message || JSON.stringify(publishData).substring(0, 300)}`;
            await logError({
                source: 'publisher.ig.carousel',
                errorMessage: reason,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    meta_subcode: meta.error_subcode,
                    container_id: parentData.id,
                },
            });
        }
    } catch (e: any) {
        await logError({
            source: 'publisher.ig.carousel',
            errorMessage: `IG carousel fetch/publish threw: ${e?.message || e}`,
            stackTrace: e?.stack,
            context: { post_slug: post.slug, post_title: post.title },
        });
    }

    return result;
}

// ── Facebook Page publisher ────────────────────────────────────
//
// Posts go directly to the KumoLab Page:
//   - If stagedVideoUrl is provided (the post originated from a YouTube
//     video and we already pulled the MP4 to our bucket for IG Reels),
//     we use the FB Reels API: /video_reels start → hosted-URL upload →
//     finish. Same video URL we feed IG; one bucket, two platforms.
//   - Otherwise we use /{PAGE_ID}/photos (image + caption in one call)
//     for image posts, falling back to /{PAGE_ID}/feed for text-only.
// How many image (non-video) posts have gone to the FB Page in the last 24h.
// Video FB posts carry a staged_video_url and don't count. Fails CLOSED (returns
// false) if the count can't be read, so we never over-post past the cap.
async function fbImagePostsUnderCap(cap: number): Promise<boolean> {
    if (!(cap > 0)) return false;
    try {
        const { supabaseAdmin } = await import('../supabase/admin');
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { count, error } = await supabaseAdmin
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .gte('published_at', since)
            .not('social_ids->>facebook_id', 'is', null)
            .is('social_ids->>staged_video_url', null);
        if (error) return false;
        return (count ?? 0) < cap;
    } catch {
        return false;
    }
}

async function publishToFacebookPage(post: BlogPost, stagedVideoUrl: string | null = null): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!META_ACCESS_TOKEN) return result;

    const lead = (post as any).excerpt || post.content?.substring(0, 300) || '';
    const hashtags = buildSocialHashtags({
        title: post.title,
        claim_type: (post as any).claimType || (post as any).claim_type,
        anime_id: post.anime_id,
        override: (post as any).hashtags,
    }).join(' ');
    // Per Jose's directive (2026-05-05): no URL in FB captions. FB
    // algorithmically downranks posts with external links, and the
    // Page's Website field surfaces as a clickable header anyway.
    // Match IG's link-in-bio convention to maximize reach.
    const message = `${post.title}\n\n${lead}\n\n${hashtags}`.substring(0, 8000);

    if (stagedVideoUrl) {
        return await publishFacebookReel(post, stagedVideoUrl, message);
    }

    try {
        const hasImage = !!post.image;
        const endpoint = hasImage
            ? `https://graph.facebook.com/v18.0/${FB_PAGE_ID}/photos`
            : `https://graph.facebook.com/v18.0/${FB_PAGE_ID}/feed`;

        const params = new URLSearchParams({
            access_token: META_ACCESS_TOKEN,
            ...(hasImage
                ? { url: post.image!, caption: message }
                : { message }),
        });

        const res = await fetchWithTimeout(`${endpoint}?${params}`, { method: 'POST' }, 20_000);
        const data = await res.json();

        const postId = data.post_id || data.id;
        if (postId) {
            result.facebook_id = postId;
            result.facebook_url = `https://facebook.com/${postId}`;
            console.log(`✅ [Facebook] Published ${hasImage ? 'photo' : 'text'}: ${postId}`);
        } else {
            const meta = data?.error || {};
            const reason = meta.code === 190
                ? `FB token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                : `FB ${hasImage ? 'photo' : 'feed'} publish failed: ${meta.message || JSON.stringify(data).substring(0, 300)}`;
            await logError({
                source: 'publisher.fb',
                errorMessage: reason,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    meta_subcode: meta.error_subcode,
                    media_type: hasImage ? 'PHOTO' : 'FEED',
                },
            });
        }
    } catch (e: any) {
        await logError({
            source: 'publisher.fb',
            errorMessage: `FB fetch/publish threw: ${e?.message || e}`,
            stackTrace: e?.stack,
            context: { post_slug: post.slug, post_title: post.title },
        });
    }

    return result;
}

// FB Reels: 3-phase flow. Start gets a video_id + upload_url, upload phase
// hands FB the public bucket URL via the `file_url` header (no byte streaming
// from us), finish flips it to PUBLISHED with the description.
async function publishFacebookReel(
    post: BlogPost,
    videoUrl: string,
    description: string,
): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!META_ACCESS_TOKEN) return result;

    try {
        // Phase 1: start
        const startRes = await fetchWithTimeout(
            `https://graph.facebook.com/v18.0/${FB_PAGE_ID}/video_reels`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ upload_phase: 'start', access_token: META_ACCESS_TOKEN }),
            },
            20_000,
        );
        const startData = await startRes.json();
        if (!startData.video_id || !startData.upload_url) {
            const meta = startData?.error || {};
            await logError({
                source: 'publisher.fb.reels',
                errorMessage: `FB Reels start failed: ${meta.message || JSON.stringify(startData).substring(0, 300)}`,
                context: { post_slug: post.slug, meta_code: meta.code, phase: 'start' },
            });
            return result;
        }

        // Phase 2: hosted upload (FB pulls the MP4 from our bucket)
        const uploadRes = await fetchWithTimeout(
            startData.upload_url,
            {
                method: 'POST',
                headers: { authorization: `OAuth ${META_ACCESS_TOKEN}`, file_url: videoUrl },
            },
            60_000,
        );
        if (uploadRes.status !== 200) {
            const body = await uploadRes.text();
            await logError({
                source: 'publisher.fb.reels',
                errorMessage: `FB Reels upload failed HTTP ${uploadRes.status}: ${body.substring(0, 300)}`,
                context: { post_slug: post.slug, video_id: startData.video_id, phase: 'upload' },
            });
            return result;
        }

        // Phase 3: finish (publishes the Reel with description)
        const finishRes = await fetchWithTimeout(
            `https://graph.facebook.com/v18.0/${FB_PAGE_ID}/video_reels?` +
                new URLSearchParams({
                    access_token: META_ACCESS_TOKEN,
                    upload_phase: 'finish',
                    video_id: startData.video_id,
                    video_state: 'PUBLISHED',
                    description,
                }),
            { method: 'POST' },
            30_000,
        );
        const finishData = await finishRes.json();
        if (finishData.post_id) {
            result.facebook_id = finishData.post_id;
            result.facebook_url = `https://facebook.com/${FB_PAGE_ID}/posts/${finishData.post_id}`;
            console.log(`✅ [Facebook] Published Reel: ${finishData.post_id}`);
        } else {
            const meta = finishData?.error || {};
            await logError({
                source: 'publisher.fb.reels',
                errorMessage: `FB Reels finish failed: ${meta.message || JSON.stringify(finishData).substring(0, 300)}`,
                context: {
                    post_slug: post.slug,
                    video_id: startData.video_id,
                    meta_code: meta.code,
                    phase: 'finish',
                },
            });
        }
    } catch (e: any) {
        await logError({
            source: 'publisher.fb.reels',
            errorMessage: `FB Reels threw: ${e?.message || e}`,
            stackTrace: e?.stack,
            context: { post_slug: post.slug, post_title: post.title },
        });
    }

    return result;
}

// ── Threads publisher ──────────────────────────────────────────
//
// Threads has 3 media types: TEXT, IMAGE, VIDEO. We post:
//   - VIDEO when stagedVideoUrl is set (the YouTube → Supabase MP4 we
//     already fetched for IG/FB Reels). Same poll-status pattern as IG.
//   - IMAGE when there's no video but post.image is set.
//   - TEXT_POST otherwise.
//
// Threads doesn't take long captions like FB, but it's also not as
// hashtag-light as some assume. We send a punchy version: title + lead
// + link, no hashtag spam.
async function publishToThreads(post: BlogPost, stagedVideoUrl: string | null = null): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!THREADS_ACCESS_TOKEN || !THREADS_USER_ID) return result;

    const lead = (post as any).excerpt || post.content?.substring(0, 200) || '';
    // Per Jose's directive (2026-05-05): no URL in Threads captions.
    // Threads format rewards short native posts; URLs read as
    // copy-pasted CMS output and underperform on shares/replies.
    // Match IG's link-in-bio convention to maximize reach.
    // Threads max ~500 chars. Title + short lead.
    const text = `${post.title}\n\n${lead}`.substring(0, 500);

    const isVideo = !!stagedVideoUrl;
    const hasImage = !!post.image;

    try {
        // Phase 1: create container
        const containerUrl = `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`;
        const containerParams = new URLSearchParams({
            access_token: THREADS_ACCESS_TOKEN,
            text,
            media_type: isVideo ? 'VIDEO' : hasImage ? 'IMAGE' : 'TEXT',
            ...(isVideo ? { video_url: stagedVideoUrl! } : {}),
            ...(!isVideo && hasImage ? { image_url: post.image! } : {}),
            // Tag the post into a Threads topic for discovery (one allowed).
            ...(THREADS_TOPIC_TAG ? { topic_tag: THREADS_TOPIC_TAG } : {}),
        });

        const containerRes = await fetchWithTimeout(`${containerUrl}?${containerParams}`, { method: 'POST' }, 20_000);
        const containerData = await containerRes.json();

        if (!containerData.id) {
            const meta = containerData?.error || {};
            await logError({
                source: 'publisher.threads.container',
                errorMessage: `Threads container creation failed: ${meta.message || JSON.stringify(containerData).substring(0, 300)}`,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    media_type: isVideo ? 'VIDEO' : hasImage ? 'IMAGE' : 'TEXT',
                },
            });
            return result;
        }

        // Phase 2: poll status (video and image containers need ingest)
        // Per docs: TEXT containers are ready instantly, IMAGE/VIDEO need polling.
        if (isVideo || hasImage) {
            // Same reasoning as IG above — Threads VIDEO transcoding
            // can run 60–150s on Meta's side. Match the IG ceiling.
            const maxWaitMs = isVideo ? 180_000 : 8_000;
            const pollIntervalMs = isVideo ? 5_000 : 2_000;
            const start = Date.now();
            let finalStatus: string | null = null;
            while (Date.now() - start < maxWaitMs) {
                await new Promise(r => setTimeout(r, pollIntervalMs));
                const statusRes = await fetchWithTimeout(
                    `https://graph.threads.net/v1.0/${containerData.id}?fields=status&access_token=${encodeURIComponent(THREADS_ACCESS_TOKEN)}`,
                    { method: 'GET' },
                    10_000,
                );
                const statusData = await statusRes.json().catch(() => ({}));
                finalStatus = statusData.status || null;
                if (finalStatus === 'FINISHED') break;
                if (finalStatus === 'ERROR' || finalStatus === 'EXPIRED') {
                    await logError({
                        source: 'publisher.threads.container',
                        errorMessage: `Threads container ingest ${finalStatus}: ${JSON.stringify(statusData).substring(0, 300)}`,
                        context: { post_slug: post.slug, container_id: containerData.id },
                    });
                    return result;
                }
            }
            if (finalStatus !== 'FINISHED' && isVideo) {
                await logError({
                    source: 'publisher.threads.container',
                    errorMessage: `Threads VIDEO container did not reach FINISHED in ${maxWaitMs / 1000}s (last: ${finalStatus || 'unknown'})`,
                    context: { post_slug: post.slug, container_id: containerData.id },
                });
                return result;
            }
        }

        // Phase 3: publish container
        const publishUrl = `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`;
        const publishParams = new URLSearchParams({
            access_token: THREADS_ACCESS_TOKEN,
            creation_id: containerData.id,
        });
        const publishRes = await fetchWithTimeout(`${publishUrl}?${publishParams}`, { method: 'POST' }, 15_000);
        const publishData = await publishRes.json();

        if (publishData.id) {
            result.threads_id = publishData.id;
            result.threads_url = `https://www.threads.net/@kumolabanime/post/${publishData.id}`;
            console.log(`✅ [Threads] Published ${isVideo ? 'video' : hasImage ? 'image' : 'text'}: ${publishData.id}`);
        } else {
            const meta = publishData?.error || {};
            await logError({
                source: 'publisher.threads.publish',
                errorMessage: `Threads publish phase failed: ${meta.message || JSON.stringify(publishData).substring(0, 300)}`,
                context: {
                    post_slug: post.slug,
                    post_title: post.title,
                    meta_code: meta.code,
                    media_type: isVideo ? 'VIDEO' : hasImage ? 'IMAGE' : 'TEXT',
                },
            });
        }
    } catch (e: any) {
        await logError({
            source: 'publisher.threads',
            errorMessage: `Threads fetch/publish threw: ${e?.message || e}`,
            stackTrace: e?.stack,
            context: { post_slug: post.slug, post_title: post.title },
        });
    }

    return result;
}

// Legacy export for any remaining callers
export { publishToSocials as publishToMeta };
