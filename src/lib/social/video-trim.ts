/**
 * video-trim.ts
 *
 * Operator-driven re-cut of an imported video. Takes the staged MP4 in
 * blog-videos, trims to [trimStart, trimEnd] seconds, optionally burns
 * in the KumoLab watermark, uploads the result back to blog-videos under
 * a new path, and returns the public URL.
 *
 * Why a separate helper from video-processor.ts:
 *   video-processor is the auto-pipeline's "scale-letterbox to 1080×1920
 *   + watermark + 60s ceiling" pre-publish pass. This one preserves the
 *   source resolution and is driven by operator-chosen trim points. They
 *   share the ffmpeg-static binary but the filter graphs are different
 *   enough that combining would make both harder to read.
 *
 * Filter strategy:
 *   - No watermark + no trim: refuse (caller should just keep the original)
 *   - Trim only: stream-copy (no re-encode) — runs in ~1s on a 60s clip
 *   - Watermark on: must re-encode video stream (drawtext modifies frames),
 *     audio still copies
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { supabaseAdmin } from '../supabase/admin';
import { logError } from '../logging/structured-logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath = require('ffmpeg-static') as string;
const BUCKET = 'blog-videos';
const WATERMARK_TEXT = '@KumoLabAnime';

export interface TrimOptions {
    /** Seconds into the source to start. Use 0 for "from beginning". */
    trimStart: number;
    /** Seconds into the source to end at. Use sourceDuration for "to end". */
    trimEnd: number;
    /** Burn @KumoLabAnime into the bottom-right corner. Default off. */
    watermark: boolean;
}

export interface TrimResult {
    bucket_url: string;
    bucket_path: string;
    bytes: number;
    duration_seconds: number;
}

export interface TrimError {
    error: string;
}

export function isTrimError(r: TrimResult | TrimError): r is TrimError {
    return (r as TrimError).error !== undefined;
}

/**
 * Download a public bucket URL into a Buffer. We do NOT use the Supabase
 * client here because the URL is already a fully-qualified public CDN
 * link — a plain fetch is simpler and avoids re-resolving the path.
 */
async function fetchBucketVideo(url: string): Promise<Buffer | null> {
    try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return null;
        const arr = await r.arrayBuffer();
        return Buffer.from(arr);
    } catch {
        return null;
    }
}

/**
 * Build the FFmpeg argv for a trim+optional-watermark pass between two
 * real files on disk. Using /tmp on Vercel (writable, 512 MB) lets us:
 *   - Fast-seek the input with pre-input -ss (requires seekable source)
 *   - Use +faststart on output (requires seekable destination, otherwise
 *     ffmpeg errors with "muxer does not support non seekable output")
 * Both of these die when piping through stdin/stdout.
 */
function buildArgs(
    opts: TrimOptions,
    fontPathEscaped: string | null,
    inputPath: string,
    outputPath: string,
): string[] {
    const duration = Math.max(0, opts.trimEnd - opts.trimStart);
    const base: string[] = [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        // Pre-input fast seek — works because input is a real file
        '-ss', opts.trimStart.toFixed(3),
        '-i', inputPath,
        '-t', duration.toFixed(3),
    ];

    if (opts.watermark && fontPathEscaped) {
        // Re-encode video to apply drawtext; audio stream-copies.
        const drawtext = [
            `drawtext=`,
            `fontfile='${fontPathEscaped}'`,
            `:text='${WATERMARK_TEXT}'`,
            `:fontcolor=white@0.92`,
            `:fontsize=42`,
            `:borderw=3`,
            `:bordercolor=black@0.8`,
            `:shadowx=0`,
            `:shadowy=2`,
            `:shadowcolor=black@0.7`,
            `:x=w-tw-40`,
            `:y=h-th-60`,
        ].join('');

        return [
            ...base,
            '-vf', drawtext,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'high',
            '-level', '4.1',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            outputPath,
        ];
    }

    // No watermark — stream-copy is the fast path.
    return [
        ...base,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
    ];
}

interface FfmpegResult {
    output: Buffer | null;
    exitCode: number | null;
    stderrTail: string;
    spawnError?: string;
}

function runFfmpegFileIO(args: string[]): Promise<FfmpegResult> {
    return new Promise((resolve) => {
        let proc;
        try {
            proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e: any) {
            const msg = e?.message || String(e);
            console.error('[VideoTrim] spawn failed:', msg);
            resolve({ output: null, exitCode: null, stderrTail: '', spawnError: msg });
            return;
        }

        let stderrTail = '';
        proc.stderr.on('data', (c: Buffer) => {
            stderrTail = (stderrTail + c.toString()).slice(-2000);
        });

        const timer = setTimeout(() => {
            console.error('[VideoTrim] FFmpeg exceeded 90s, killing');
            try { proc.kill('SIGKILL'); } catch { /* noop */ }
        }, 90_000);

        proc.on('error', (e: Error) => {
            clearTimeout(timer);
            console.error('[VideoTrim] FFmpeg error:', e.message);
            resolve({ output: null, exitCode: null, stderrTail, spawnError: e.message });
        });

        proc.on('close', (code: number) => {
            clearTimeout(timer);
            if (code !== 0) {
                console.error(`[VideoTrim] FFmpeg exited ${code}. Tail:\n${stderrTail}`);
                resolve({ output: null, exitCode: code, stderrTail });
                return;
            }
            // Output is on disk; caller reads it. Return an empty buffer
            // here just to signal success — the real bytes come from
            // readFileSync(outputPath) in the orchestrator.
            resolve({ output: Buffer.alloc(0), exitCode: code, stderrTail });
        });
    });
}

export async function trimImportedVideo(
    sourceUrl: string,
    postId: string,
    opts: TrimOptions,
): Promise<TrimResult | TrimError> {
    if (opts.trimEnd <= opts.trimStart) {
        return { error: 'trimEnd must be greater than trimStart' };
    }

    const sourceBuf = await fetchBucketVideo(sourceUrl);
    if (!sourceBuf) {
        return { error: 'Failed to fetch source video from bucket' };
    }

    let fontPathEscaped: string | null = null;
    if (opts.watermark) {
        const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
        if (fs.existsSync(fontPath)) {
            fontPathEscaped = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        } else {
            console.warn('[VideoTrim] Outfit-Black.ttf missing — watermark will fall back to default font');
            fontPathEscaped = ''; // empty fontfile = ffmpeg uses default
        }
    }

    // Vercel /tmp is writable (512 MB) and the only place we can use
    // seekable file I/O. Both -movflags +faststart on output and fast-seek
    // -ss on input require real files — they fail on stdin/stdout pipes.
    const tmpDir = os.tmpdir();
    const tmpId = crypto.randomBytes(6).toString('hex');
    const inputPath = path.join(tmpDir, `trim-in-${tmpId}.mp4`);
    const outputPath = path.join(tmpDir, `trim-out-${tmpId}.mp4`);

    const cleanup = () => {
        try { fs.unlinkSync(inputPath); } catch { /* noop */ }
        try { fs.unlinkSync(outputPath); } catch { /* noop */ }
    };

    try {
        fs.writeFileSync(inputPath, sourceBuf);
    } catch (e: any) {
        cleanup();
        await logError({
            source: 'video-trim.tmpwrite',
            errorMessage: `Could not write source to /tmp: ${e?.message || e}`,
            context: { postId, bytes: sourceBuf.length },
        }).catch(() => {});
        return { error: 'Failed to stage source video on server' };
    }

    const args = buildArgs(opts, fontPathEscaped, inputPath, outputPath);
    const ff = await runFfmpegFileIO(args);
    if (ff.exitCode !== 0 || !fs.existsSync(outputPath)) {
        const summary = ff.spawnError
            ? `spawn failed: ${ff.spawnError}`
            : `ffmpeg exited ${ff.exitCode}: ${ff.stderrTail.slice(-400) || 'no stderr'}`;
        cleanup();
        await logError({
            source: 'video-trim.ffmpeg',
            errorMessage: `FFmpeg failed — ${summary}`,
            context: { postId, opts, ffmpegArgs: args },
        }).catch(() => {});
        return { error: `Video processing failed — ${summary.slice(0, 200)}` };
    }

    let out: Buffer;
    try {
        out = fs.readFileSync(outputPath);
    } catch (e: any) {
        cleanup();
        await logError({
            source: 'video-trim.tmpread',
            errorMessage: `Could not read processed output: ${e?.message || e}`,
            context: { postId, outputPath },
        }).catch(() => {});
        return { error: 'Failed to read processed video from server' };
    }
    cleanup();
    if (out.length === 0) {
        return { error: 'Processed video is empty' };
    }

    // New bucket path so we never overwrite the original (operator may want
    // to retry with different trim points; the source must remain intact).
    const bucketPath = `import-trimmed-${postId}-${Date.now()}.mp4`;
    const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(bucketPath, out, { contentType: 'video/mp4', upsert: false });
    if (upErr) {
        await logError({
            source: 'video-trim.upload',
            errorMessage: `bucket upload failed: ${upErr.message}`,
            context: { postId, bucketPath, bytes: out.length },
        }).catch(() => {});
        return { error: `Storage upload failed: ${upErr.message}` };
    }
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(bucketPath);

    return {
        bucket_url: pub.publicUrl,
        bucket_path: bucketPath,
        bytes: out.length,
        duration_seconds: opts.trimEnd - opts.trimStart,
    };
}
