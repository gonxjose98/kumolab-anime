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

import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../supabase/admin';
import { processForSocial } from './video-processor';
import { logError, logAction } from '../logging/structured-logger';
import {
    QUALITY_MIN_HEIGHT,
    QUALITY_MIN_BITRATE,
    QUALITY_FULL_HEIGHT,
    QUALITY_FULL_BITRATE,
    type VideoQuality,
} from '../engine/scoring';

const BUCKET = 'blog-videos';
// Raised 80 → 120 MB (Jose 2026-07-17): once the Render worker serves 1080p
// (bestvideo[height>=1080]+bestaudio), a ~3-min trailer can exceed 80 MB and
// would otherwise be dropped before the quality gate ever ran.
const MAX_BYTES = 120 * 1024 * 1024;

export interface TrailerStaged {
    bucket_url: string;
    bucket_path: string;
    video_id: string;
    duration_seconds: number;
    bytes: number;
    title?: string;
    /** ffprobe result for the RAW downloaded MP4 (pre-watermark re-encode).
     *  null when the probe itself failed (gate fails open — see below). */
    quality: VideoQuality | null;
}

export interface FetchYouTubeOptions {
    // Skip the 9:16 letterbox + 60s trim FFmpeg pass. Used by operator-
    // curated scrapes where the operator will trim/crop in the editor.
    skipSocialProcessing?: boolean;
    // Override the default 180s hard cap. Auto-publish keeps 180s; the
    // scrape path allows up to 300s (5min) to fit longer OPs/trailers.
    maxDurationSeconds?: number;
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

/**
 * yt-dlp /info failures split into two kinds:
 *   • Content conditions — geo-blocked, unaired premiere, private/members-
 *     only, removed/terminated, age-gated. Nothing the operator can fix, and
 *     they recur every publish cycle (a premiere is retried hourly until it
 *     airs; a Japan-only trailer forever). These are operational skips, not
 *     faults — same philosophy as the publisher's no-screenshot skip.
 *   • Infrastructure faults — timeouts, real 5xx with no yt-dlp signature,
 *     the "sign in to confirm you're not a bot" IP wall (rotate the proxy),
 *     missing config. These ARE actionable and must surface as errors.
 *
 * Returns a short reason code for content conditions, or null when the
 * failure should be treated as a real error.
 */
function classifyNonActionableInfoFailure(detail: string): string | null {
    const d = detail.toLowerCase();
    // NOTE: "sign in to confirm you're not a bot" is deliberately NOT here —
    // it means the worker's IP got flagged, which is actionable (rotate proxy).
    if (/not made this video available in your country|available in your country|video is available in /.test(d)) return 'geo_restricted';
    if (/premieres in|will begin in|this live event|premiere will begin/.test(d)) return 'premiere_not_aired';
    if (/private video|members[- ]only|join this channel to get access/.test(d)) return 'private_or_members_only';
    if (/video unavailable|has been removed|no longer available|account associated with this video has been terminated|removed by the uploader/.test(d)) return 'video_unavailable';
    if (/age-restricted|confirm your age|inappropriate for some users/.test(d)) return 'age_restricted';
    return null;
}

function workerEnv(): { url: string; secret: string } | null {
    const url = process.env.YT_WORKER_URL;
    const secret = process.env.YT_WORKER_SECRET;
    if (!url || !secret) return null;
    return { url: url.replace(/\/$/, ''), secret };
}

// ── Video-quality probe (ffprobe) ──────────────────────────────
// ENGINE-AUDIT-2026-07.md section 4: measure the RAW fetched MP4 before the
// watermark re-encode. Floor: >=720p AND >=1.2 Mbps (below → the auto path
// rejects, no screenshot fallback). FULL bar: >=1080p AND >=2.5 Mbps with real
// motion. Also detects slideshow/near-static sources (a "trailer" that is one
// still + music) via inter-frame packet sizes — no decode pass needed.

const ffprobePath: string = (() => {
    try {
        // ffprobe-static exports { path } — Linux x64 binary on Vercel,
        // ffprobe.exe locally on Windows (same pattern as ffmpeg-static).
        return (require('ffprobe-static') as { path: string }).path || '';
    } catch {
        return '';
    }
})();

function runFfprobe(args: string[], timeoutMs = 20_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        let proc;
        try {
            proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e: any) {
            return resolve({ code: null, stdout: '', stderr: e?.message || 'spawn failed' });
        }
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
        proc.stderr.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000); });
        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* noop */ } }, timeoutMs);
        proc.on('error', (e: Error) => { clearTimeout(timer); resolve({ code: null, stdout, stderr: e.message }); });
        proc.on('close', (code: number | null) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
}

/**
 * ffprobe the MP4 buffer: height, bitrate, fps, FULL/OK/REJECT tier, and a
 * real-motion flag. Returns null when the probe itself fails (missing binary,
 * corrupt container) — the caller FAILS OPEN in that case, matching the
 * pipeline's philosophy that a gate bug must never halt publishing.
 */
export async function probeVideoQuality(video: Buffer): Promise<VideoQuality | null> {
    if (!ffprobePath) return null;
    const tmpPath = path.join(tmpdir(), `kumolab-probe-${randomBytes(6).toString('hex')}.mp4`);
    try {
        await writeFile(tmpPath, video);

        // Pass 1: stream + container metadata.
        const meta = await runFfprobe([
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,avg_frame_rate,bit_rate,nb_frames',
            '-show_entries', 'format=bit_rate,duration',
            '-of', 'json',
            tmpPath,
        ]);
        if (meta.code !== 0) return null;
        const parsed = JSON.parse(meta.stdout || '{}');
        const stream = parsed?.streams?.[0] || {};
        const format = parsed?.format || {};

        const height = parseInt(String(stream.height ?? 0), 10) || 0;
        if (!height) return null;

        const duration = parseFloat(String(format.duration ?? 0)) || 0;
        // Prefer the video stream's own bitrate; fall back to the container's,
        // then to bytes*8/duration (some muxes omit bit_rate entirely).
        const bitrate =
            (parseInt(String(stream.bit_rate ?? 0), 10) || 0) ||
            (parseInt(String(format.bit_rate ?? 0), 10) || 0) ||
            (duration > 0 ? Math.round((video.length * 8) / duration) : 0);

        let fps = 0;
        const fr = String(stream.avg_frame_rate || '');
        const frMatch = /^(\d+)\/(\d+)$/.exec(fr);
        if (frMatch && parseInt(frMatch[2], 10) > 0) fps = parseInt(frMatch[1], 10) / parseInt(frMatch[2], 10);
        else fps = parseFloat(fr) || 0;

        // Pass 2: real-motion heuristic. A slideshow/near-static source encodes
        // its inter (non-key) frames as near-empty packets — real footage never
        // does. Sample the first 30s of video packets; if we have a meaningful
        // sample and the median non-keyframe packet is tiny, it's not real
        // motion. Conservative threshold so real low-action shots never trip it.
        let real_motion = true;
        const pk = await runFfprobe([
            '-v', 'error',
            '-select_streams', 'v:0',
            '-read_intervals', '%+30',
            '-show_entries', 'packet=size,flags',
            '-of', 'csv=p=0',
            tmpPath,
        ]);
        if (pk.code === 0) {
            const interSizes: number[] = [];
            for (const line of pk.stdout.split('\n')) {
                const parts = line.trim().split(',');
                if (parts.length < 2) continue;
                const size = parseInt(parts[0], 10);
                const flags = parts[1] || '';
                if (!Number.isFinite(size)) continue;
                if (!flags.includes('K')) interSizes.push(size);
            }
            if (interSizes.length >= 30) {
                interSizes.sort((a, b) => a - b);
                const median = interSizes[Math.floor(interSizes.length / 2)];
                if (median < 250) real_motion = false;
            }
        }

        const quality_tier: VideoQuality['quality_tier'] =
            height < QUALITY_MIN_HEIGHT || bitrate < QUALITY_MIN_BITRATE ? 'REJECT'
            : height >= QUALITY_FULL_HEIGHT && bitrate >= QUALITY_FULL_BITRATE && real_motion ? 'FULL'
            : 'OK';

        return { height, bitrate, fps: Math.round(fps * 100) / 100, quality_tier, real_motion };
    } catch (e: any) {
        console.warn('[TrailerFetcher] ffprobe failed (gate fails open):', e?.message || e);
        return null;
    } finally {
        await unlink(tmpPath).catch(() => {});
    }
}

export async function fetchYouTubeToBucket(
    sourceUrl: string,
    slug: string,
    options: FetchYouTubeOptions = {},
): Promise<TrailerStaged | null> {
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
        const reason = classifyNonActionableInfoFailure(infoRes.err);
        if (reason) {
            // Content condition (geo-block, unaired premiere, private,
            // removed, age-gated) — operational skip, not a fault. Route to
            // action_logs so it doesn't pollute the dashboard's Errors 24h
            // counter. The caller treats a null return as a clean skip.
            await logAction({
                action: 'source_fetch_failed',
                entityType: 'post',
                entityTitle: slug,
                reason: `youtube fetch skipped: ${reason}`,
                details: { videoId, sourceUrl, slug, detail: infoRes.err.slice(0, 250) },
            }).catch(() => {});
        } else {
            // Genuine worker/infra fault — surface it.
            await logError({
                source: 'trailer-fetcher.info',
                errorMessage: `worker /info failed: ${infoRes.err.slice(0, 250)}`,
                context: { videoId, sourceUrl, slug, worker: worker.url },
            }).catch(() => {});
        }
        return null;
    }
    title = infoRes.title;
    duration = infoRes.duration;

    const maxDuration = options.maxDurationSeconds ?? 180;
    if (duration > maxDuration) {
        console.warn(`[TrailerFetcher] Video too long (${duration}s > ${maxDuration}s), skipping`);
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

    // 2b. Video-quality gate (ENGINE-AUDIT section 4). Probe the RAW download
    // (pre-watermark re-encode, so the numbers reflect the source). On the
    // auto path we enforce the floor: <720p or <1.2 Mbps → 'low_quality';
    // slideshow/near-static → 'not_real_motion'. Both are operational skips
    // (action_logs) — the publisher's existing null-return path takes over
    // (no screenshot fallback, retryable). The operator-curated scrape path
    // (skipSocialProcessing) is NOT gated: the operator judges quality in the
    // editor. A failed probe fails OPEN — a gate bug must never halt publishes.
    const quality = await probeVideoQuality(downloaded);
    if (quality) {
        console.log(`[TrailerFetcher] Probe ${videoId}: ${quality.height}p @ ${(quality.bitrate / 1e6).toFixed(2)} Mbps, ${quality.fps} fps, tier ${quality.quality_tier}, motion=${quality.real_motion}`);
    }
    if (quality && !options.skipSocialProcessing) {
        const rejectReason = quality.quality_tier === 'REJECT'
            ? 'low_quality'
            : !quality.real_motion ? 'not_real_motion' : null;
        if (rejectReason) {
            await logAction({
                action: 'video_quality_rejected',
                entityType: 'post',
                entityTitle: slug,
                reason: rejectReason === 'low_quality'
                    ? `low_quality: ${quality.height}p @ ${(quality.bitrate / 1e6).toFixed(2)} Mbps (floor ${QUALITY_MIN_HEIGHT}p / ${QUALITY_MIN_BITRATE / 1e6} Mbps)`
                    : 'not_real_motion: slideshow / near-static source',
                details: {
                    videoId, sourceUrl, slug,
                    height: quality.height,
                    bitrate: quality.bitrate,
                    fps: quality.fps,
                    real_motion: quality.real_motion,
                },
            }).catch(() => {});
            return null;
        }
    }

    // 3. FFmpeg pass — 9:16 letterbox, KumoLab watermark, 60s trim. Skipped
    // when the caller is the operator-curated scrape path (they trim/crop
    // in the editor).
    let finalBuffer = downloaded;
    if (!options.skipSocialProcessing) {
        try {
            const processed = await processForSocial(downloaded, { aspect: '9:16', maxSeconds: 60 });
            if (processed && processed.length > 0) {
                console.log(`[TrailerFetcher] FFmpeg pass: ${downloaded.length} → ${processed.length} bytes`);
                finalBuffer = processed;
            }
        } catch (e: any) {
            console.warn('[TrailerFetcher] FFmpeg pass threw, uploading raw:', e?.message || e);
        }
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
        // When the social-processing pass runs, the video gets trimmed to 60s.
        // When it's skipped (scrape path), report the original duration so
        // the editor's trim timeline shows the full clip.
        duration_seconds: options.skipSocialProcessing ? duration : Math.min(duration, 60),
        bytes: finalBuffer.length,
        title,
        quality,
    };
}
