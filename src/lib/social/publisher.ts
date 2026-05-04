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

export interface SocialPublishResult {
    instagram_id?: string;
    instagram_url?: string;
    facebook_id?: string;
    facebook_url?: string;
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
 *     Threads cross-post is still handled by IG (Meta Suite fans IG → Threads).
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
            console.warn(`[Social] YouTube source but video fetch failed for ${post.slug} — falling back to image post`);
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
            const fbResult = await publishToFacebookPage(post);
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

    // ── 4. Video platforms for TRAILER_DROP only ───────────────
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
// Posts go directly to the KumoLab Page. We use /{PAGE_ID}/photos for
// image posts (image + caption in one call, returns a post_id) and fall
// back to /{PAGE_ID}/feed for text-only. We don't post the IG Reel video
// to FB via API because (a) Reels on FB has a separate `/video_reels`
// flow that requires a `published=false` upload then `start` then
// `finish` — overkill for our volume, and (b) FB users get more reach
// from a clean image post + caption + link to kumolabanime.com than from
// a re-uploaded vertical Reel. So FB always gets the image flavor.
async function publishToFacebookPage(post: BlogPost): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!META_ACCESS_TOKEN) return result;

    const lead = (post as any).excerpt || post.content?.substring(0, 300) || '';
    const hashtags = buildSocialHashtags({
        title: post.title,
        claim_type: (post as any).claimType || (post as any).claim_type,
        anime_id: post.anime_id,
    }).join(' ');
    const link = `https://kumolabanime.com/${post.slug}`;
    // FB doesn't truncate as aggressively as IG. Keep it punchy + include the
    // link so the post drives traffic back to the blog.
    const message = `${post.title}\n\n${lead}\n\n${link}\n\n${hashtags}`.substring(0, 8000);

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

        // /photos returns { id, post_id } — post_id is the wall post we want to link to.
        // /feed returns { id } directly.
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

// Legacy export for any remaining callers
export { publishToSocials as publishToMeta };
