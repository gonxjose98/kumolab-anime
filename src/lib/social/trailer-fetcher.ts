/**
 * trailer-fetcher.ts
 *
 * Given a YouTube URL, fetch the muxed MP4 from our Render-hosted yt-dlp
 * worker, run the FFmpeg watermark+9:16+trim pass, and stage in the
 * blog-videos Supabase bucket. Returns a public URL that IG Reels +
 * TikTok + YT Shorts publishers point at.
 *
 * Why an external worker:
 *   YouTube blocks AWS Lambda IPs (Vercel's runtime) with a "sign in to
 *   confirm you're not a bot" wall — yt-dlp running directly inside Vercel
 *   fails on every call. The Render worker runs on a clean IP range,
 *   handles the YouTube fetch, and streams the bytes back to us over HTTPS.
 *
 * Reliability notes:
 *   - Render's free tier sleeps after 15 min of inactivity. First call after
 *     an idle period adds ~30s cold-start latency. Subsequent calls are fast.
 *   - 60s read timeout on info, 90s on download. yt-dlp inside the worker
 *     has its own kill timer.
 */

import { supabaseAdmin } from '../supabase/admin';
import { processForSocial } from './video-processor';
import { logError } from '../logging/structured-logger';

const BUCKET = 'blog-videos';
const MAX_BYTES = 80 * 1024 * 1024;

export interface TrailerStaged {
    bucket_url: string;
    bucket_path: string;
    video_id: string;
    duration_seconds: number;
    bytes: number;
    title?: string;
}

function extractVideoId(url: string): string | null {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) {
            return u.pathname.replace(/^\//, '').split('/')[0] || null;
        }
        const v = u.searchParams.get('v');
        if (v) return v;
        const short = u.pathname.match(/\/shorts\/([^/]+)/);
        if (short) return short[1];
    } catch { /* fall through */ }
    return null;
}

function workerEnv(): { url: string; secret: string } | null {
    const url = process.env.YT_WORKER_URL;
    const secret = process.env.YT_WORKER_SECRET;
    if (!url || !secret) return null;
    return { url: url.replace(/\/$/, ''), secret };
}

export async function fetchYouTubeToBucket(sourceUrl: string, slug: string): Promise<TrailerStaged | null> {
    const videoId = extractVideoId(sourceUrl);
    if (!videoId) {
        await logError({
            source: 'trailer-fetcher.input',
            errorMessage: `Could not extract video ID from URL`,
            context: { sourceUrl, slug },
        }).catch(() => {});
        return null;
    }

    const worker = workerEnv();
    if (!worker) {
        await logError({
            source: 'trailer-fetcher.config',
            errorMessage: 'YT_WORKER_URL / YT_WORKER_SECRET not set — cannot fetch YouTube videos',
            context: { videoId, slug },
        }).catch(() => {});
        return null;
    }

    const canonical = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Probe metadata first so we can bail on long videos before pulling
    // tens of megabytes. Render free tier cold-starts can take 30-90s,
    // and when multiple posts publish in the same hourly tick they queue
    // up behind each other on the proxy — so we give /info up to 150s
    // and retry once on AbortError (cold-start almost always recovers).
    let title = '';
    let duration = 0;
    const callInfo = async (): Promise<{ ok: true; title: string; duration: number } | { ok: false; err: string }> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 150_000);
        try {
            const r = await fetch(`${worker.url}/info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${worker.secret}`,
                },
                body: JSON.stringify({ url: canonical }),
                signal: ctrl.signal,
            });
            if (!r.ok) {
                const detail = (await r.text().catch(() => '')).slice(0, 300);
                return { ok: false, err: `HTTP ${r.status}: ${detail}` };
            }
            const j = await r.json();
            return { ok: true, title: j.title || '', duration: parseInt(String(j.duration ?? 0), 10) || 0 };
        } catch (e: any) {
            return { ok: false, err: (e?.message || e).toString() };
        } finally {
            clearTimeout(timer);
        }
    };

    let infoRes = await callInfo();
    if (!infoRes.ok && /abort/i.test(infoRes.err)) {
        // Cold-start aborts: warm the worker and try once more.
        await new Promise((r) => setTimeout(r, 3_000));
        infoRes = await callInfo();
    }
    if (!infoRes.ok) {
        await logError({
            source: 'trailer-fetcher.info',
            errorMessage: `worker /info failed: ${infoRes.err.slice(0, 250)}`,
            context: { videoId, sourceUrl, slug, worker: worker.url },
        }).catch(() => {});
        return null;
    }
    title = infoRes.title;
    duration = infoRes.duration;

    if (duration > 180) {
        console.warn(`[TrailerFetcher] Video too long (${duration}s > 180s), skipping`);
        return null;
    }

    // 2. Stream the muxed MP4 from the worker into a Buffer.
    // 720p at ~30 MB through a proxy + Render free-tier latency can take
    // 60-120s on slow proxies. Give it 180s.
    const dlCtrl = new AbortController();
    const dlTimer = setTimeout(() => dlCtrl.abort(), 180_000);
    let downloaded: Buffer;
    try {
        const r = await fetch(`${worker.url}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${worker.secret}`,
            },
            body: JSON.stringify({ url: canonical }),
            signal: dlCtrl.signal,
        });
        if (!r.ok) {
            const detail = (await r.text().catch(() => '')).slice(0, 300);
            throw new Error(`HTTP ${r.status}: ${detail}`);
        }
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('video/')) {
            const detail = (await r.text().catch(() => '')).slice(0, 300);
            throw new Error(`unexpected content-type ${ct}: ${detail}`);
        }
        const arr = await r.arrayBuffer();
        if (arr.byteLength > MAX_BYTES) {
            throw new Error(`exceeded max bytes (${arr.byteLength} > ${MAX_BYTES})`);
        }
        downloaded = Buffer.from(arr);
        if (downloaded.length === 0) {
            throw new Error('worker returned 0 bytes');
        }
    } catch (e: any) {
        await logError({
            source: 'trailer-fetcher.download',
            errorMessage: `worker /download failed: ${(e?.message || e).toString().slice(0, 250)}`,
            context: { videoId, sourceUrl, slug, duration },
        }).catch(() => {});
        return null;
    } finally {
        clearTimeout(dlTimer);
    }
    console.log(`[TrailerFetcher] Worker delivered ${downloaded.length} bytes for ${videoId}`);

    // 3. FFmpeg pass — 9:16 letterbox, KumoLab watermark, 60s trim.
    let finalBuffer = downloaded;
    try {
        const processed = await processForSocial(downloaded, { aspect: '9:16', maxSeconds: 60 });
        if (processed && processed.length > 0) {
            console.log(`[TrailerFetcher] FFmpeg pass: ${downloaded.length} → ${processed.length} bytes`);
            finalBuffer = processed;
        }
    } catch (e: any) {
        console.warn('[TrailerFetcher] FFmpeg pass threw, uploading raw:', e?.message || e);
    }

    // 4. Upload to bucket.
    const bucketPath = `${slug}-${videoId}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(bucketPath, finalBuffer, { contentType: 'video/mp4', upsert: true });
    if (uploadError) {
        await logError({
            source: 'trailer-fetcher.upload',
            errorMessage: `bucket upload failed: ${uploadError.message}`,
            context: { videoId, slug, bytes: finalBuffer.length },
        }).catch(() => {});
        return null;
    }
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(bucketPath);

    return {
        bucket_url: pub.publicUrl,
        bucket_path: bucketPath,
        video_id: videoId,
        duration_seconds: Math.min(duration, 60),
        bytes: finalBuffer.length,
        title,
    };
}
