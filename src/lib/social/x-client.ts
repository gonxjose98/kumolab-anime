// X (Twitter) API v2 client for the @KumoLabAnime account.
//
// Auth is OAuth 1.0a user context (the app's consumer key/secret + the
// account's access token/secret, all server-side env vars). Signing is done
// by hand so we don't take on a dependency for ~40 lines of HMAC.
//
// Billing is pay-per-use (Oct 2026): ~$0.015 per post, $0.001 per owned read.
// Keep reads small and infrequent.
import crypto from 'crypto';

const API = 'https://api.x.com/2';

function creds() {
    const c = {
        key: process.env.X_API_KEY,
        secret: process.env.X_API_SECRET,
        token: process.env.X_ACCESS_TOKEN,
        tokenSecret: process.env.X_ACCESS_SECRET,
    };
    return c.key && c.secret && c.token && c.tokenSecret ? (c as Record<keyof typeof c, string>) : null;
}

export const xConfigured = () => !!creds();

// RFC 3986 encoding (encodeURIComponent leaves !'()* alone).
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());

/**
 * OAuth 1.0a Authorization header. Only query params are signed: JSON and
 * multipart bodies are excluded from the signature base string by spec.
 */
function authHeader(method: string, url: string): string {
    const c = creds();
    if (!c) throw new Error('X credentials missing (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET)');
    const u = new URL(url);
    const oauth: Record<string, string> = {
        oauth_consumer_key: c.key,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: String(Math.floor(Date.now() / 1000)),
        oauth_token: c.token,
        oauth_version: '1.0',
    };
    const params: [string, string][] = [...Object.entries(oauth), ...u.searchParams.entries()];
    const paramStr = params
        .map(([k, v]) => [enc(k), enc(v)] as [string, string])
        .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
    const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(paramStr)].join('&');
    const signature = crypto.createHmac('sha1', `${enc(c.secret)}&${enc(c.tokenSecret)}`).update(base).digest('base64');
    return 'OAuth ' + Object.entries({ ...oauth, oauth_signature: signature })
        .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
        .join(', ');
}

async function xFetch(method: string, url: string, body?: { json?: unknown; form?: FormData }): Promise<any> {
    const headers: Record<string, string> = { Authorization: authHeader(method, url) };
    let payload: BodyInit | undefined;
    if (body?.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body.json);
    } else if (body?.form) {
        payload = body.form;
    }
    const res = await fetch(url, { method, headers, body: payload, cache: 'no-store' });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
        const msg = data?.detail || data?.title || data?.errors?.[0]?.message || text.slice(0, 300);
        throw new Error(`X ${method} ${new URL(url).pathname} ${res.status}: ${msg}`);
    }
    return data;
}

/** Confirms the keys work and returns the account (no secrets). */
export async function verifyX(): Promise<{ id: string; username: string; name: string; followers?: number; posts?: number }> {
    const j = await xFetch('GET', `${API}/users/me?user.fields=public_metrics`);
    const d = j.data || {};
    return { id: d.id, username: d.username, name: d.name, followers: d.public_metrics?.followers_count, posts: d.public_metrics?.tweet_count };
}

const CHUNK = 4 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads an image or video from a public URL via the v2 chunked media flow
 * (initialize → append → finalize → poll status). Returns the media id.
 */
export async function uploadMediaFromUrl(mediaUrl: string, kind: 'image' | 'video'): Promise<string> {
    const r = await fetch(mediaUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error(`fetch media ${r.status}: ${mediaUrl}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const mediaType = r.headers.get('content-type')?.split(';')[0] || (kind === 'video' ? 'video/mp4' : 'image/jpeg');

    const init = await xFetch('POST', `${API}/media/upload/initialize`, {
        json: { media_type: mediaType, total_bytes: buf.length, media_category: kind === 'video' ? 'tweet_video' : 'tweet_image' },
    });
    const id: string = init?.data?.id;
    if (!id) throw new Error(`X media initialize returned no id: ${JSON.stringify(init).slice(0, 200)}`);

    for (let i = 0, seg = 0; i < buf.length; i += CHUNK, seg++) {
        const form = new FormData();
        form.append('segment_index', String(seg));
        form.append('media', new Blob([new Uint8Array(buf.subarray(i, i + CHUNK))], { type: 'application/octet-stream' }));
        await xFetch('POST', `${API}/media/upload/${id}/append`, { form });
    }

    const fin = await xFetch('POST', `${API}/media/upload/${id}/finalize`);
    let info = fin?.data?.processing_info;
    // Videos transcode asynchronously; images usually come back ready.
    for (let tries = 0; info && info.state !== 'succeeded' && tries < 40; tries++) {
        if (info.state === 'failed') throw new Error(`X media processing failed: ${JSON.stringify(info.error || info).slice(0, 200)}`);
        await sleep(Math.min(10, Math.max(2, Number(info.check_after_secs) || 3)) * 1000);
        const st = await xFetch('GET', `${API}/media/upload?command=STATUS&media_id=${id}`);
        info = st?.data?.processing_info;
    }
    if (info && info.state !== 'succeeded') throw new Error('X media processing timed out');
    return id;
}

export async function postTweet(opts: { text: string; mediaIds?: string[]; replyTo?: string }): Promise<{ id: string; url: string }> {
    const body: any = { text: opts.text };
    if (opts.mediaIds?.length) body.media = { media_ids: opts.mediaIds.slice(0, 4) };
    if (opts.replyTo) body.reply = { in_reply_to_tweet_id: opts.replyTo };
    const j = await xFetch('POST', `${API}/tweets`, { json: body });
    const id = j?.data?.id;
    if (!id) throw new Error(`X post returned no id: ${JSON.stringify(j).slice(0, 200)}`);
    return { id, url: `https://x.com/KumoLabAnime/status/${id}` };
}

export interface XTweetMetrics { id: string; created_at: string; impressions: number; likes: number; reposts: number; replies: number; }

/** The account's own posts since `startTime` with public metrics (owned reads). */
export async function getOwnTweets(userId: string, startTime: Date, max = 100): Promise<XTweetMetrics[]> {
    const q = new URLSearchParams({
        max_results: String(Math.min(100, Math.max(5, max))),
        start_time: startTime.toISOString(),
        'tweet.fields': 'public_metrics,created_at',
    });
    const j = await xFetch('GET', `${API}/users/${userId}/tweets?${q}`);
    return (j?.data || []).map((t: any) => ({
        id: t.id,
        created_at: t.created_at,
        impressions: Number(t.public_metrics?.impression_count) || 0,
        likes: Number(t.public_metrics?.like_count) || 0,
        reposts: Number(t.public_metrics?.retweet_count) || 0,
        replies: Number(t.public_metrics?.reply_count) || 0,
    }));
}
