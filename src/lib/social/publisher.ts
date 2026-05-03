import { BlogPost } from '@/types';
import { fetchYouTubeToBucket } from './trailer-fetcher';
import { publishToTikTok } from './tiktok-publisher';
import { publishToYouTubeShorts } from './youtube-publisher';
import { fetchWithTimeout } from '../http';
import { buildSocialHashtags } from './hashtags';
import { logError } from '../logging/structured-logger';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const IG_USER_ID = process.env.META_IG_ID;

export interface SocialPublishResult {
    instagram_id?: string;
    instagram_url?: string;
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
 *   - Instagram: every published post. Meta Suite cross-posts IG → FB + Threads on
 *     Jose's side, so do NOT call the FB or Threads APIs directly here.
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

    // ── 1. Instagram (always) ──────────────────────────────────
    if (META_ACCESS_TOKEN && IG_USER_ID) {
        try {
            const igResult = await publishToInstagram(post);
            Object.assign(result, igResult);
            // No umbrella log on missing instagram_id — every meaningful
            // failure mode (container, publish, fetch) already calls
            // logError with the precise Meta error before we get here.
            // Logging again at this layer just produced duplicate rows on
            // the dashboard with no extra information.
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

    // ── 2. Video platforms for TRAILER_DROP only ───────────────
    const claim = (post as any).claimType || (post as any).claim_type;
    const sourceUrl = (post as any).source_url || '';
    const isYouTubeSource = /youtube\.com|youtu\.be/.test(sourceUrl);

    if (claim === 'TRAILER_DROP' && isYouTubeSource) {
        const staged = await fetchYouTubeToBucket(sourceUrl, post.slug);
        if (staged) {
            result.staged_video_url = staged.bucket_url;

            // TikTok
            const tiktok = await publishToTikTok({
                title: post.title,
                videoUrl: staged.bucket_url,
            });
            if (tiktok.tiktok_publish_id) result.tiktok_publish_id = tiktok.tiktok_publish_id;
            if (tiktok.tiktok_url) result.tiktok_url = tiktok.tiktok_url;
            if (tiktok.skipped) console.log('[Social] TikTok:', tiktok.skipped);
            if (tiktok.error) console.error('[Social] TikTok error:', tiktok.error);

            // YouTube Shorts
            const yt = await publishToYouTubeShorts({
                title: post.title,
                description: post.content,
                videoUrl: staged.bucket_url,
            });
            if (yt.youtube_video_id) result.youtube_video_id = yt.youtube_video_id;
            if (yt.youtube_url) result.youtube_url = yt.youtube_url;
            if (yt.skipped) console.log('[Social] YT Shorts:', yt.skipped);
            if (yt.error) console.error('[Social] YT Shorts error:', yt.error);
        } else {
            console.warn(`[Social] TRAILER_DROP but trailer fetch failed for ${post.slug} — skipping TikTok + YT`);
        }
    }

    return result;
}

// ── Instagram publisher (split out for readability) ─────────────
async function publishToInstagram(post: BlogPost): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};
    if (!IG_USER_ID || !META_ACCESS_TOKEN) return result;

    try {
        // Caption: title + AI-generated excerpt (KumoLab voice) + smart hashtags.
        // Falls back to a content slice if excerpt is missing for any reason.
        const lead = (post as any).excerpt || post.content?.substring(0, 300) || '';
        const hashtags = buildSocialHashtags({
            title: post.title,
            claim_type: (post as any).claimType || (post as any).claim_type,
            anime_id: post.anime_id,
        }).join(' ');
        const caption = `${post.title}\n\n${lead}\n\n${hashtags}`.substring(0, 2200);

        const containerUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`;
        const containerParams = new URLSearchParams({
            image_url: post.image || '',
            caption,
            access_token: META_ACCESS_TOKEN || '',
        });

        const containerRes = await fetchWithTimeout(`${containerUrl}?${containerParams}`, { method: 'POST' }, 15_000);
        const containerData = await containerRes.json();

        if (!containerData.id) {
            const meta = containerData?.error || {};
            const reason = meta.code === 190
                ? `IG token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                : `IG container creation failed: ${meta.message || JSON.stringify(containerData).substring(0, 300)}`;
            await logError({
                source: 'publisher.ig.container',
                errorMessage: reason,
                context: { post_slug: post.slug, post_title: post.title, meta_code: meta.code, meta_subcode: meta.error_subcode },
            });
            return result;
        }

        const publishUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish`;
        const publishParams = new URLSearchParams({
            creation_id: containerData.id,
            access_token: META_ACCESS_TOKEN || '',
        });

        // IG needs ~4s to process the media container before publish.
        await new Promise(r => setTimeout(r, 4000));

        const publishRes = await fetchWithTimeout(`${publishUrl}?${publishParams}`, { method: 'POST' }, 15_000);
        const publishData = await publishRes.json();

        if (publishData.id) {
            result.instagram_id = publishData.id;
            result.instagram_url = `https://instagram.com/p/${publishData.id}`;
            console.log(`✅ [Instagram] Published: ${publishData.id} (Meta Suite will cross-post to FB + Threads)`);
        } else {
            const meta = publishData?.error || {};
            const reason = meta.code === 190
                ? `IG token expired/invalid (Meta code 190): ${meta.message || 'session expired'}`
                : `IG publish phase failed: ${meta.message || JSON.stringify(publishData).substring(0, 300)}`;
            await logError({
                source: 'publisher.ig.publish',
                errorMessage: reason,
                context: { post_slug: post.slug, post_title: post.title, meta_code: meta.code, meta_subcode: meta.error_subcode },
            });
        }
    } catch (e: any) {
        await logError({
            source: 'publisher.ig.publish',
            errorMessage: `IG fetch/publish threw: ${e?.message || e}`,
            stackTrace: e?.stack,
            context: { post_slug: post.slug, post_title: post.title },
        });
    }

    return result;
}

// Legacy export for any remaining callers
export { publishToSocials as publishToMeta };
