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

/**
 * Convert an image Buffer to a portrait MP4 Reel. Returns null on
 * failure — caller falls back to publishing the image as-is.
 */
export async function imageToReel(
    input: Buffer,
    opts: ImageToVideoOptions = {},
): Promise<Buffer | null> {
    const duration = opts.durationSec ?? DURATION_SEC;
    const direction = opts.direction ?? 'in';
    const totalFrames = duration * FPS;

    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
    const fontExists = fs.existsSync(fontPath);
    const fontArg = fontExists ? `:fontfile='${fontPath.replace(/\\/g, '/')}'` : '';

    // zoompan zoom curve: ease from 1.0 → 1.15 over the duration. The
    // 'on' iterator in zoompan goes from 0 to (totalFrames - 1).
    // direction=in goes 1 → 1.15; out goes 1.15 → 1.
    const zoomExpr = direction === 'in'
        ? `1 + 0.15*(on/${totalFrames})`
        : `1.15 - 0.15*(on/${totalFrames})`;

    // Filter graph:
    //   1. scale to oversize cover so the zoom never reveals empty pixels
    //   2. zoompan creates the motion frames at 1080x1920
    //   3. setsar to square pixels
    //   4. drawtext for the bottom-right watermark
    const filter = [
        `scale=${TARGET_W * 2}:${TARGET_H * 2}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_W * 2}:${TARGET_H * 2}`,
        `zoompan=z='${zoomExpr}':s=${TARGET_W}x${TARGET_H}:d=${totalFrames}:fps=${FPS}`,
        'setsar=1',
        `drawtext=text='${WATERMARK_TEXT}'${fontArg}:fontcolor=white@0.85:fontsize=32:x=w-tw-32:y=h-th-44:shadowcolor=black@0.7:shadowx=2:shadowy=2`,
    ].join(',');

    const args = [
        '-y',
        '-loop', '1',
        '-i', 'pipe:0',         // image stdin
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',  // silent audio track
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
        '-f', 'mp4',
        'pipe:1',
    ];

    return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        let stderrTail = '';

        proc.stdout.on('data', (c: Buffer) => chunks.push(c));
        proc.stderr.on('data', (c: Buffer) => { stderrTail = (stderrTail + c.toString()).slice(-2000); });
        proc.on('error', (e) => {
            console.error('[ImageToReel] spawn error:', e.message);
            resolve(null);
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                console.error(`[ImageToReel] ffmpeg exit ${code}, stderr tail:\n${stderrTail.slice(-800)}`);
                resolve(null);
                return;
            }
            resolve(Buffer.concat(chunks));
        });

        // 60s ceiling — image-to-video is a small, fast operation.
        const killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 60_000);
        proc.on('close', () => clearTimeout(killTimer));

        proc.stdin.write(input);
        proc.stdin.end();
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
