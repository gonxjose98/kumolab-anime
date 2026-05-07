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

    // Note: drawtext filter isn't available in the bundled ffmpeg-static
    // build on Vercel for this code path (despite the binary advertising
    // --enable-libfreetype), so we skip the watermark on image-to-Reel
    // output. Plain image-source posts don't need a video watermark
    // anyway — the brand identity comes from the static image content.

    // Ken Burns zoom via scale (time-varying) + fixed-dimension crop.
    //
    // Why this approach:
    //   - zoompan filter silently produces 0 bytes on Vercel's FFmpeg
    //   - crop's w/h expressions are evaluated ONCE at config time, so
    //     they can't be time-varying — but x/y can. Only animating
    //     position would give pan, not zoom.
    //   - scale's w/h DO accept time variable t per-frame. Combine with
    //     a fixed center-crop and you get true Ken Burns zoom.
    //
    // Pipeline:
    //   1. First scale: cover-fit to 2160-wide working canvas
    //   2. Center-crop to 2160x3840 to square the aspect
    //   3. Scale-zoom: grow over time so cropped center looks zoomed
    //   4. Center-crop fixed 1080x1920 = the output Reel frame
    const SRC_W = TARGET_W * 2;   // 2160 working canvas
    const SRC_H = TARGET_H * 2;   // 3840
    const ZOOM_FACTOR = 1.13;      // final zoom = 13% larger over `duration` seconds

    // Time-varying scale factor.
    //   in:  s = 1 + (Z-1)*t/D    grows from 1 to ZOOM_FACTOR
    //   out: s = Z - (Z-1)*t/D    shrinks from ZOOM_FACTOR back to 1
    const scaleFactor = direction === 'in'
        ? `(1+${ZOOM_FACTOR - 1}*t/${duration})`
        : `(${ZOOM_FACTOR}-${ZOOM_FACTOR - 1}*t/${duration})`;

    // Use lanczos scaler for every scale step — preserves significantly
    // more detail when upscaling small images (which is the common case
    // for AniList cover sources at ~460px wide). Default FFmpeg scaler
    // is bilinear, which softens edges and produces visible pixelation.
    const filter = [
        `scale=${SRC_W}:${SRC_H}:force_original_aspect_ratio=increase:flags=lanczos`,
        `crop=${SRC_W}:${SRC_H}`,
        // Time-varying scale: grow the source image larger than the
        // working canvas. Cropped center frame appears to zoom.
        `scale=w='${SRC_W}*${scaleFactor}':h='${SRC_H}*${scaleFactor}':eval=frame:flags=lanczos`,
        `crop=${TARGET_W}:${TARGET_H}:(iw-${TARGET_W})/2:(ih-${TARGET_H})/2`,
        'setsar=1',
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
        // ultrafast: image-to-Reel has minimal real motion (just a slow
        // zoom on a static frame), so the slowdown from veryfast→ultrafast
        // is invisible quality-wise but cuts encode time ~3x. veryfast
        // at lanczos was running at 0.09x realtime on Vercel = 130s per
        // 12s of output, which blew past the 90s kill timer. Need to
        // come in well under our SLA.
        '-preset', 'ultrafast',
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

        // 180s ceiling — Vercel cold starts + lanczos scaler + libx264 can
        // push 12s of output to 60-90s of real time. Earlier 90s killed
        // a publish at 83% through. Plenty of margin now.
        const killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 180_000);
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
 *
 * Auto-upgrades AniList CDN URLs from /large/ (~460px) to /extra-large/
 * (~1080px+) before fetching — much higher-resolution source means a
 * sharper Reel after upscaling. Falls back to the original URL if the
 * extra-large variant doesn't exist.
 */
export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    const candidates: string[] = [];
    // AniList higher-res variant — same path, different size segment
    if (/\/cover\/large\//.test(url) || /\/cover\/medium\//.test(url) || /\/cover\/small\//.test(url)) {
        candidates.push(url.replace(/\/cover\/(large|medium|small)\//, '/cover/extra-large/'));
    }
    candidates.push(url);

    for (const candidate of candidates) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 30_000);
            const res = await fetch(candidate, { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) continue;
            const arr = await res.arrayBuffer();
            const buf = Buffer.from(arr);
            if (buf.length > 0) {
                if (candidate !== url) console.log(`[ImageToReel] Upgraded source ${url} → ${candidate}`);
                return buf;
            }
        } catch {
            // try next
        }
    }
    return null;
}
