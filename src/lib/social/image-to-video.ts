// image-to-video.ts
//
// Convert a static post image into a 12-second slow-zoom (Ken Burns) MP4
// at 1080×1920 (Reels/TikTok native). Why we do this:
//
//   IG's algorithm in 2025 hard-prefers Reels over still images. For
//   accounts under ~5k followers, image-only posts reach 30-50% of
//   followers in hour 1 vs 70%+ for Reels, and image posts almost never
//   land in Explore. Ken-Burns'ing the still into a 12s video flips it
//   into the Reels surface and typically gets 5-10× the reach for the
//   same underlying post.
//
// FFmpeg filter graph:
//   - Scale up to a working resolution (2000×3556, oversize so the zoom
//     doesn't reveal pixelated edges)
//   - Crop-pad to 9:16 frame
//   - zoompan with z=ease for a smooth slow zoom
//   - Burn KumoLab watermark bottom-right
//   - 12s duration, 30fps, h264 + silent aac (Reels accepts no-audio
//     but quietly down-ranks; muted track maximizes distribution)
//
// Same FFmpeg binary as video-processor.ts (ffmpeg-static).
//
// Output is a Buffer the caller stages to blog-videos and feeds to
// IG Reels / FB Reels / Threads VIDEO publishers.

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

const ffmpegPath = require('ffmpeg-static') as string;

const TARGET_W = 1080;
const TARGET_H = 1920;
const DURATION_SEC = 12;
const FPS = 30;
const WATERMARK_TEXT = '@KumoLabAnime';

export interface ImageToVideoOptions {
    durationSec?: number;
    direction?: 'in' | 'out'; // zoom in (default — focuses interest) or zoom out
}

export interface ImageToReelResult {
    buffer: Buffer | null;
    stderr: string;
    exitCode: number | null;
    args: string[];
}

/**
 * Convert an image Buffer to a portrait MP4 Reel. Returns a result with
 * the buffer (or null on failure) plus diagnostic info — caller logs
 * stderr to error_logs when buffer is null so we can debug FFmpeg
 * failures without reading Vercel function logs.
 */
export async function imageToReel(
    input: Buffer,
    opts: ImageToVideoOptions = {},
): Promise<ImageToReelResult> {
    const duration = opts.durationSec ?? DURATION_SEC;
    const direction = opts.direction ?? 'in';
    const totalFrames = duration * FPS;

    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
    const fontExists = fs.existsSync(fontPath);
    const fontArg = fontExists ? `:fontfile='${fontPath.replace(/\\/g, '/')}'` : '';

    // Use a crop+scale animation instead of zoompan. zoompan is finicky
    // with looped image inputs (silently produces 0 bytes for many
    // image/version combos on Vercel's bundled FFmpeg). crop with
    // time-varying expressions is rock-solid across versions.
    //
    // Approach:
    //   1. Cover-scale image to a large oversize working canvas
    //   2. Center-crop to the canvas (squares the aspect)
    //   3. Crop a smaller region over time (linear scale 1.0 → 0.87
    //      for "in"; reverse for "out") = Ken Burns zoom effect
    //   4. Scale that crop to 1080x1920 = the output frame
    //   5. Watermark
    const SRC_W = TARGET_W * 2;   // 2160 working canvas
    const SRC_H = TARGET_H * 2;   // 3840
    const ZOOM_DELTA = 0.13;       // 13% zoom — gentle, doesn't crop too much

    // Crop scale over time. t is FFmpeg's filter time in seconds.
    //   in:  s = 1 - δ*t/D       starts at 1 (full frame), shrinks to (1-δ)
    //   out: s = (1-δ) + δ*t/D   starts at (1-δ), grows back to 1
    const cropScale = direction === 'in'
        ? `(1 - ${ZOOM_DELTA}*t/${duration})`
        : `(${1 - ZOOM_DELTA} + ${ZOOM_DELTA}*t/${duration})`;

    const filter = [
        `scale=${SRC_W}:${SRC_H}:force_original_aspect_ratio=increase`,
        `crop=${SRC_W}:${SRC_H}`,
        // Time-animated crop. iw/ih are the previous filter's output
        // dims (= SRC_W, SRC_H). x/y center the smaller crop window.
        `crop=w='iw*${cropScale}':h='ih*${cropScale}':x='(iw-out_w)/2':y='(ih-out_h)/2'`,
        `scale=${TARGET_W}:${TARGET_H}`,
        'setsar=1',
        `drawtext=text='${WATERMARK_TEXT}'${fontArg}:fontcolor=white@0.85:fontsize=32:x=w-tw-32:y=h-th-44:shadowcolor=black@0.7:shadowx=2:shadowy=2`,
    ].join(',');

    // Write input image to /tmp first — stdin pipe for PNG input is
    // fragile (FFmpeg has trouble auto-detecting format from a piped
    // stream when combined with -loop 1). File input is rock-solid on
    // Vercel's /tmp filesystem.
    const tmpDir = os.tmpdir();
    const tmpId = crypto.randomBytes(6).toString('hex');
    const inPath = path.join(tmpDir, `img-${tmpId}.bin`);
    const outPath = path.join(tmpDir, `out-${tmpId}.mp4`);

    try {
        await fs.promises.writeFile(inPath, input);
    } catch (e: any) {
        console.error('[ImageToReel] tmp write failed:', e?.message || e);
        return { buffer: null, stderr: `tmp write failed: ${e?.message || e}`, exitCode: null, args: [] };
    }

    const args = [
        '-y',
        '-loop', '1',
        '-i', inPath,
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', String(duration),
        '-vf', filter,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-preset', 'veryfast',
        '-crf', '23',
        '-r', String(FPS),
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        outPath,
    ];

    return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderrTail = '';

        proc.stdout.on('data', () => {});
        proc.stderr.on('data', (c: Buffer) => { stderrTail = (stderrTail + c.toString()).slice(-3000); });
        proc.on('error', (e) => {
            console.error('[ImageToReel] spawn error:', e.message);
            cleanup();
            resolve({ buffer: null, stderr: `spawn error: ${e.message}\n${stderrTail}`, exitCode: null, args });
        });
        proc.on('close', async (code) => {
            if (code !== 0) {
                console.error(`[ImageToReel] ffmpeg exit ${code}, stderr tail:\n${stderrTail.slice(-1200)}`);
                cleanup();
                resolve({ buffer: null, stderr: stderrTail, exitCode: code, args });
                return;
            }
            try {
                const out = await fs.promises.readFile(outPath);
                cleanup();
                resolve({ buffer: out, stderr: stderrTail, exitCode: 0, args });
            } catch (e: any) {
                console.error('[ImageToReel] output read failed:', e?.message || e);
                cleanup();
                resolve({ buffer: null, stderr: `output read failed: ${e?.message || e}\n${stderrTail}`, exitCode: 0, args });
            }
        });

        // 90s ceiling — image-to-video is small + fast, but Vercel cold
        // starts can add overhead.
        const killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 90_000);
        proc.on('close', () => clearTimeout(killTimer));

        function cleanup() {
            try { fs.unlinkSync(inPath); } catch {}
            try { fs.unlinkSync(outPath); } catch {}
        }
    });
}

/**
 * Helper: fetch a remote image URL into a Buffer. Used by the publisher
 * when post.image is a URL we don't have the bytes for yet.
 */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30_000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        return Buffer.from(arr);
    } catch {
        return null;
    }
}
