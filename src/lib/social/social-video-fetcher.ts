/**
 * social-video-fetcher.ts
 *
 * X (twitter.com / x.com) and Instagram (instagram.com) video downloader.
 * Mirrors trailer-fetcher.ts but skips the YouTube-specific URL canonicalization
 * and the 9:16 FFmpeg pass — these are operator-curated imports, not auto-
 * generated trailer Reels, so the operator can decide later whether to letterbox.
 *
 * Calls the same Render-hosted yt-dlp worker as the YouTube path. yt-dlp natively
 * supports X and IG, so the worker accepts these URLs as-is. Returns the staged
 * bucket URL plus the original post's title/description so the AI draft helper
 * has context for title + caption generation.
 *
 * IG failure mode is intentional: when the worker can't extract a Reel (auth-
 * walled, geo-blocked, etc.) we return null + the reason, and the orchestrator
 * surfaces the error to the modal. No screenshot or thumbnail fallback.
 */

import { supabaseAdmin } from '../supabase/admin';
import { logError } from '../logging/structured-logger';

const BUCKET = 'blog-videos';
const MAX_BYTES = 80 * 1024 * 1024;

export type SocialPlatform = 'x' | 'instagram';

export interface SocialVideoStaged {
    bucket_url: string;
    bucket_path: string;
    bytes: number;
    duration_seconds: number;
    platform: SocialPlatform;
    original_title: string;
    original_description: string;
}

export interface SocialVideoError {
    error: string;
    platform: SocialPlatform | null;
}

export function detectSocialPlatform(url: string): SocialPlatform | null {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('twitter.com') || host.includes('x.com')) return 'x';
        if (host.includes('instagram.com')) return 'instagram';
        return null;
    } catch {
        return null;
    }
}

function workerEnv(): { url: string; secret: string } | null {
    const url = process.env.YT_WORKER_URL;
    const secret = process.env.YT_WORKER_SECRET;
    if (!url || !secret) return null;
    return { url: url.replace(/\/$/, ''), secret };
}

export async function fetchSocialVideoToBucket(
    sourceUrl: string,
    slug: string,
): Promise<SocialVideoStaged | SocialVideoError> {
    const platform = detectSocialPlatform(sourceUrl);
    if (!platform) {
        return { error: 'URL is not an X or Instagram link', platform: null };
    }

    const worker = workerEnv();
    if (!worker) {
        await logError({
            source: 'social-video-fetcher.config',
            errorMessage: 'YT_WORKER_URL / YT_WORKER_SECRET not set',
            context: { sourceUrl, slug, platform },
        }).catch(() => {});
        return { error: 'Video worker not configured', platform };
    }

    // 1. Probe metadata. Same generous timeout as the YouTube path — Render
    // free tier can cold-start for 30-90s, and on a busy worker the info
    // call queues behind active downloads.
    let title = '';
    let description = '';
    let duration = 0;
    const callInfo = async (): Promise<{ ok: true } | { ok: false; err: string }> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 150_000);
        try {
            const r = await fetch(`${worker.url}/info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${worker.secret}`,
                },
                body: JSON.stringify({ url: sourceUrl }),
                signal: ctrl.signal,
            });
            if (!r.ok) {
                const detail = (await r.text().catch(() => '')).slice(0, 300);
                return { ok: false, err: `HTTP ${r.status}: ${detail}` };
            }
            const j = await r.json();
            title = (j.title || '').toString();
            description = (j.description || j.fulltitle || '').toString();
            duration = parseInt(String(j.duration ?? 0), 10) || 0;
            return { ok: true };
        } catch (e: any) {
            return { ok: false, err: (e?.message || e).toString() };
        } finally {
            clearTimeout(timer);
        }
    };

    let infoRes = await callInfo();
    if (!infoRes.ok && /abort/i.test(infoRes.err)) {
        await new Promise((r) => setTimeout(r, 3_000));
        infoRes = await callInfo();
    }
    if (!infoRes.ok) {
        await logError({
            source: 'social-video-fetcher.info',
            errorMessage: `worker /info failed: ${infoRes.err.slice(0, 250)}`,
            context: { sourceUrl, slug, platform },
        }).catch(() => {});
        const surfaced = platform === 'instagram'
            ? 'Instagram download failed — the post may be private, age-gated, or region-blocked. Use the manual Upload button instead.'
            : `X download failed: ${infoRes.err.slice(0, 200)}`;
        return { error: surfaced, platform };
    }

    if (duration > 300) {
        return { error: `Video too long (${duration}s) — max 300s`, platform };
    }

    // 2. Stream the muxed MP4 from the worker.
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
            body: JSON.stringify({ url: sourceUrl }),
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
            source: 'social-video-fetcher.download',
            errorMessage: `worker /download failed: ${(e?.message || e).toString().slice(0, 250)}`,
            context: { sourceUrl, slug, platform, duration },
        }).catch(() => {});
        return {
            error: platform === 'instagram'
                ? 'Instagram video download failed — try downloading manually and using the Upload button.'
                : `X video download failed: ${(e?.message || e).toString().slice(0, 200)}`,
            platform,
        };
    } finally {
        clearTimeout(dlTimer);
    }

    // 3. Upload to bucket. No FFmpeg pass — operator decides cropping in the editor.
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').slice(0, 80);
    const bucketPath = `import-${platform}-${safeSlug}-${Date.now()}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(bucketPath, downloaded, { contentType: 'video/mp4', upsert: true });
    if (uploadError) {
        await logError({
            source: 'social-video-fetcher.upload',
            errorMessage: `bucket upload failed: ${uploadError.message}`,
            context: { slug, platform, bytes: downloaded.length },
        }).catch(() => {});
        return { error: `Storage upload failed: ${uploadError.message}`, platform };
    }
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(bucketPath);

    return {
        bucket_url: pub.publicUrl,
        bucket_path: bucketPath,
        bytes: downloaded.length,
        duration_seconds: duration,
        platform,
        original_title: title,
        original_description: description,
    };
}

export function isSocialVideoError(
    r: SocialVideoStaged | SocialVideoError,
): r is SocialVideoError {
    return (r as SocialVideoError).error !== undefined;
}
