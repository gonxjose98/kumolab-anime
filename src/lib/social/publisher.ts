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
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;

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

    // ── 1. Stage YouTube video FIRST (any YouTube source) ─────
    // Per Jose's directive: if the post's source is a YouTube video,
    // the video itself is what should ship to social — not a screenshot
    // of the thumbnail. We expanded this from TRAILER_DROP-only to ALL
    // YouTube-sourced claims so season confirms / date announces / etc.
    // also publish as Reels when there's a real video underlying them.
    // Same staged URL feeds TikTok + YT Shorts below.
    const claim = (post as any).claimType || (post as any).claim_type;
    const sourceUrl = (post as any).source_url || '';
    const isYouTubeSource = /youtube\.com|youtu\.be/.test(sourceUrl);

    let stagedVideoUrl: string | null = null;
    if (isYouTubeSource) {
        const staged = await fetchYouTubeToBucket(sourceUrl, post.slug);
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
            await logError({
                source: 'publisher.video-fetch',
                errorMessage: `YouTube video fetch failed — skipping social publish to avoid screenshot fallback`,
                context: {
                    post_id: (post as any).id,
                    slug: post.slug,
                    title: post.title,
                    source_url: sourceUrl,
                },
            }).catch(() => {});
            (result as any).skipped_reason = 'video_fetch_failed';
            return result;
        }
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

        // YouTube Shorts
        const yt = await publishToYouTubeShorts({
            title: post.title,
            description: post.content,
            videoUrl: stagedVideoUrl,
        });
        if (yt.youtube_video_id) result.youtube_video_id = yt.youtube_video_id;
        if (yt.youtube_url) result.youtube_url = yt.youtube_url;
        if (yt.skipped) console.log('[Social] YT Shorts:', yt.skipped);
        if (yt.error) console.error('[Social] YT Shorts error:', yt.error);
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
        const maxWaitMs = isReels ? 60_000 : 6_000;
        const pollIntervalMs = isReels ? 4_000 : 2_000;
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

// ── Facebook Page publisher ────────────────────────────────────
//
// Posts go directly to the KumoLab Page:
//   - If stagedVideoUrl is provided (the post originated from a YouTube
//     video and we already pulled the MP4 to our bucket for IG Reels),
//     we use the FB Reels API: /video_reels start → hosted-URL upload →
//     finish. Same video URL we feed IG; one bucket, two platforms.
//   - Otherwise we use /{PAGE_ID}/photos (image + caption in one call)
//     for image posts, falling back to /{PAGE_ID}/feed for text-only.
async function publishToFacebookPage(post: BlogPost, stagedVideoUrl: string | null = null): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!META_ACCESS_TOKEN) return result;

    const lead = (post as any).excerpt || post.content?.substring(0, 300) || '';
    const hashtags = buildSocialHashtags({
        title: post.title,
        claim_type: (post as any).claimType || (post as any).claim_type,
        anime_id: post.anime_id,
    }).join(' ');
    const link = `https://kumolabanime.com/${post.slug}`;
    const message = `${post.title}\n\n${lead}\n\n${link}\n\n${hashtags}`.substring(0, 8000);

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
    const link = `https://kumolabanime.com/${post.slug}`;
    // Threads max ~500 chars. Title + short lead + link.
    const text = `${post.title}\n\n${lead}\n\n${link}`.substring(0, 500);

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
            const maxWaitMs = isVideo ? 60_000 : 8_000;
            const pollIntervalMs = isVideo ? 4_000 : 2_000;
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
