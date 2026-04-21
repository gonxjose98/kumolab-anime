/**
 * youtube-publisher.ts
 *
 * Uploads a video file to the KumoLab YouTube channel as a Short.
 *
 * Auth: OAuth 2.0 with a long-lived refresh token. One-time consent flow to
 * generate the refresh token, then we exchange it for access tokens on every call.
 *
 * Credentials (all env vars):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   YOUTUBE_REFRESH_TOKEN    — generated via one-time OAuth flow
 *
 * When credentials are missing, publisher no-ops gracefully.
 *
 * Reference: https://developers.google.com/youtube/v3/docs/videos/insert
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';

export interface YouTubePublishInput {
    title: string;
    description: string;
    videoUrl: string;            // Our Supabase bucket URL — we fetch + re-upload as file
    tags?: string[];
    madeForKids?: boolean;
}

export interface YouTubePublishResult {
    youtube_video_id?: string;
    youtube_url?: string;
    skipped?: string;
    error?: string;
}

async function getAccessToken(): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) return null;

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    });

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
        console.error('[YouTube] Token exchange failed:', data);
        return null;
    }
    return data.access_token as string;
}

export async function publishToYouTubeShorts(input: YouTubePublishInput): Promise<YouTubePublishResult> {
    if (!process.env.YOUTUBE_REFRESH_TOKEN) {
        return { skipped: 'YOUTUBE_REFRESH_TOKEN not set — YT Shorts publishing disabled' };
    }
    if (process.env.AUTO_PUBLISH_SOCIALS !== 'true') {
        return { skipped: 'AUTO_PUBLISH_SOCIALS disabled' };
    }

    try {
        const accessToken = await getAccessToken();
        if (!accessToken) return { skipped: 'OAuth not configured' };

        // Fetch the video bytes from our bucket
        const videoRes = await fetch(input.videoUrl);
        if (!videoRes.ok) {
            return { error: `Failed to fetch staged video: HTTP ${videoRes.status}` };
        }
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

        // Multipart upload: metadata JSON part + video binary part
        const boundary = `kumolab-${Date.now()}`;
        const metadata = {
            snippet: {
                title: input.title.substring(0, 100),
                description: `${input.description}\n\n#Shorts #anime #animenews #kumolab`.substring(0, 5000),
                tags: (input.tags || ['anime', 'kumolab', 'animenews']).slice(0, 10),
                categoryId: '1', // Film & Animation
            },
            status: {
                privacyStatus: 'public',
                selfDeclaredMadeForKids: !!input.madeForKids,
            },
        };

        const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
        const videoPart = `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`;
        const closing = `\r\n--${boundary}--\r\n`;

        const body = Buffer.concat([
            Buffer.from(metaPart, 'utf8'),
            Buffer.from(videoPart, 'utf8'),
            videoBuffer,
            Buffer.from(closing, 'utf8'),
        ]);

        const uploadRes = await fetch(UPLOAD_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': String(body.length),
            },
            body,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
            console.error('[YouTube] Upload failed:', uploadData);
            return { error: uploadData?.error?.message || `HTTP ${uploadRes.status}` };
        }

        const videoId = uploadData.id;
        return {
            youtube_video_id: videoId,
            youtube_url: `https://youtube.com/shorts/${videoId}`,
        };
    } catch (e: any) {
        console.error('[YouTube] Network/parse error:', e.message);
        return { error: e.message };
    }
}
