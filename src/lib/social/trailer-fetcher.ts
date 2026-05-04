/**
 * trailer-fetcher.ts
 *
 * Given a YouTube URL, download the MP4 and stage it in the blog-videos Supabase
 * bucket. Returns a public URL that IG Reels + TikTok + YT Shorts publishers
 * can point at.
 *
 * Backed by `yt-dlp` (the gold-standard YouTube downloader) via the
 * `youtube-dl-exec` Node wrapper. We call yt-dlp with `-o -` so the binary
 * streams the muxed MP4 to stdout — no /tmp writes, no extra disk pressure.
 *
 * `@distube/ytdl-core` was the previous backend but YouTube's recent player
 * changes (early May 2026) broke its format extraction across the board, so
 * every trailer fetch was silently returning null and IG/TikTok/Shorts were
 * falling through to image posts.
 *
 * Reliability notes:
 *   - yt-dlp is much more aggressive about working around YouTube's
 *     anti-bot measures than ytdl-core, but it's still cat-and-mouse.
 *   - Vercel serverless timeout is 300s on this route. Trailers <90s at
 *     360p typically download in 5-15s.
 *   - On any failure the caller falls back to image-only posts.
 */

import { spawn } from 'child_process';
import { supabaseAdmin } from '../supabase/admin';
import { processForSocial } from './video-processor';

const ytDlpPath = (() => {
    // youtube-dl-exec ships the binary at node_modules/youtube-dl-exec/bin/yt-dlp(.exe).
    // Resolve it via require so the Next.js tracer follows the dep into the bundle.
    const constants = require('youtube-dl-exec/src/constants.js');
    return `${constants.YOUTUBE_DL_DIR}/${constants.YOUTUBE_DL_FILE}`;
})();

const BUCKET = 'blog-videos';
const MAX_BYTES = 80 * 1024 * 1024; // 80 MB hard cap

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

/**
 * Spawns yt-dlp, returns one of:
 *   { kind: 'json', data: <metadata> } — when --dump-single-json passes
 *   { kind: 'mp4',  data: <Buffer>   } — when -o - streams the muxed MP4
 *   { kind: 'fail', reason: <string> }
 */
function runYtDlp(args: string[], expectStdoutBytes: boolean, timeoutMs: number): Promise<{ ok: true; buf: Buffer; stderr: string } | { ok: false; reason: string }> {
    return new Promise(resolve => {
        let proc;
        try {
            proc = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e: any) {
            resolve({ ok: false, reason: `spawn failed: ${e?.message || e}` });
            return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let stderrTail = '';
        let aborted = false;

        const timer = setTimeout(() => {
            aborted = true;
            try { proc.kill('SIGKILL'); } catch { /* noop */ }
        }, timeoutMs);

        proc.stdout.on('data', (c: Buffer) => {
            total += c.length;
            if (expectStdoutBytes && total > MAX_BYTES) {
                aborted = true;
                try { proc.kill('SIGKILL'); } catch { /* noop */ }
                return;
            }
            chunks.push(c);
        });
        proc.stderr.on('data', (c: Buffer) => {
            stderrTail = (stderrTail + c.toString()).slice(-2000);
        });

        proc.on('error', (e: Error) => {
            clearTimeout(timer);
            resolve({ ok: false, reason: `process error: ${e.message}` });
        });

        proc.on('close', (code: number) => {
            clearTimeout(timer);
            if (aborted) {
                resolve({ ok: false, reason: total > MAX_BYTES ? `exceeded ${MAX_BYTES} bytes` : `timeout after ${timeoutMs}ms` });
                return;
            }
            if (code !== 0) {
                resolve({ ok: false, reason: `exit ${code}: ${stderrTail.slice(-300)}` });
                return;
            }
            resolve({ ok: true, buf: Buffer.concat(chunks), stderr: stderrTail });
        });
    });
}

export async function fetchYouTubeToBucket(sourceUrl: string, slug: string): Promise<TrailerStaged | null> {
    const videoId = extractVideoId(sourceUrl);
    if (!videoId) {
        console.warn('[TrailerFetcher] Could not extract video ID from:', sourceUrl);
        return null;
    }

    const canonical = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Get metadata to check duration before downloading 80 MB of bytes.
    const infoResult = await runYtDlp(
        [
            '--dump-single-json',
            '--no-warnings',
            '--no-playlist',
            '--skip-download',
            canonical,
        ],
        true,
        20_000,
    );
    if (!infoResult.ok) {
        console.warn('[TrailerFetcher] yt-dlp info failed:', infoResult.reason);
        return null;
    }
    let info: any;
    try {
        info = JSON.parse(infoResult.buf.toString('utf8'));
    } catch {
        console.warn('[TrailerFetcher] yt-dlp info JSON parse failed');
        return null;
    }
    const duration = parseInt(String(info.duration ?? 0), 10);
    if (duration > 180) {
        console.warn(`[TrailerFetcher] Video too long (${duration}s > 180s), skipping`);
        return null;
    }

    // 2. Download the muxed MP4 to stdout. Format selector picks the best
    // sub-720p mp4 with audio that yt-dlp can serve directly without
    // ffmpeg-merging (we'll merge + watermark + crop in our own pass).
    // `-f 18` is the canonical combined 360p MP4 (yt-dlp falls back to a
    // bestvideo+bestaudio merge if 18 isn't available, which yt-dlp does
    // internally — we still get a single MP4 on stdout).
    const dlResult = await runYtDlp(
        [
            '-f', 'best[ext=mp4][height<=720]/18/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best',
            '--merge-output-format', 'mp4',
            '--no-warnings',
            '--no-playlist',
            '-o', '-',
            canonical,
        ],
        true,
        90_000,
    );
    if (!dlResult.ok) {
        console.warn('[TrailerFetcher] yt-dlp download failed:', dlResult.reason);
        return null;
    }
    const downloaded = dlResult.buf;
    if (downloaded.length === 0) {
        console.warn('[TrailerFetcher] yt-dlp returned 0 bytes');
        return null;
    }
    console.log(`[TrailerFetcher] Downloaded ${downloaded.length} bytes via yt-dlp`);

    // 3. FFmpeg pass — 9:16 letterbox, watermark, 60s trim. Falls back to
    // the raw download if FFmpeg fails so the trailer still ships.
    let finalBuffer = downloaded;
    try {
        const processed = await processForSocial(downloaded, { aspect: '9:16', maxSeconds: 60 });
        if (processed && processed.length > 0) {
            console.log(`[TrailerFetcher] FFmpeg pass: ${downloaded.length} → ${processed.length} bytes`);
            finalBuffer = processed;
        } else {
            console.warn('[TrailerFetcher] FFmpeg pass returned null; uploading raw download');
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
        console.error('[TrailerFetcher] Bucket upload failed:', uploadError.message);
        return null;
    }
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(bucketPath);

    return {
        bucket_url: pub.publicUrl,
        bucket_path: bucketPath,
        video_id: videoId,
        duration_seconds: Math.min(duration, 60),
        bytes: finalBuffer.length,
        title: info.title,
    };
}
