/**
 * tiktok-publisher.ts
 *
 * Content Posting API via PULL_FROM_URL. TikTok fetches the video from the
 * public Supabase URL we hand them. Saves us from streaming bytes through
 * Vercel twice (download from YT already consumed that budget).
 *
 * Credentials: TikTok developer app required. Set after Jose's app approval:
 *   TIKTOK_ACCESS_TOKEN       — user-scoped OAuth token
 *   TIKTOK_OPEN_ID            — user's open_id (returned from OAuth)
 *
 * When credentials are missing, publisher no-ops gracefully so Phase 4 cutover
 * works before TikTok approval lands.
 *
 * Reference: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';

export interface TikTokPublishInput {
    title: string;
    videoUrl: string;       // Must be a publicly fetchable URL (our Supabase bucket)
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
}

export interface TikTokPublishResult {
    tiktok_publish_id?: string;
    tiktok_url?: string;
    skipped?: string;        // Reason if we didn't actually post
    error?: string;
}

export async function publishToTikTok(input: TikTokPublishInput): Promise<TikTokPublishResult> {
    const token = process.env.TIKTOK_ACCESS_TOKEN;
    if (!token) {
        return { skipped: 'TIKTOK_ACCESS_TOKEN not set — TikTok publishing disabled' };
    }
    if (process.env.AUTO_PUBLISH_SOCIALS !== 'true') {
        return { skipped: 'AUTO_PUBLISH_SOCIALS disabled' };
    }

    try {
        const caption = `${input.title}\n\n#anime #animenews #kumolab`.substring(0, 2200);

        const body = {
            post_info: {
                title: caption,
                privacy_level: 'PUBLIC_TO_EVERYONE',
                disable_duet: !!input.disableDuet,
                disable_comment: !!input.disableComment,
                disable_stitch: !!input.disableStitch,
                video_cover_timestamp_ms: 1000,
            },
            source_info: {
                source: 'PULL_FROM_URL',
                video_url: input.videoUrl,
            },
        };

        const res = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok || data?.error?.code !== 'ok') {
            const errMsg = data?.error?.message || `HTTP ${res.status}`;
            console.error('[TikTok] Publish init failed:', errMsg, data);
            return { error: errMsg };
        }

        const publishId = data?.data?.publish_id;
        return {
            tiktok_publish_id: publishId,
            // TikTok doesn't return a URL at init — it processes async. URL becomes
            // queryable via /v2/post/publish/status/fetch/. For now we just store the ID.
            tiktok_url: publishId ? `tiktok://publish/${publishId}` : undefined,
        };
    } catch (e: any) {
        console.error('[TikTok] Network/parse error:', e.message);
        return { error: e.message };
    }
}
