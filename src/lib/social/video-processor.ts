/**
 * video-processor.ts
 *
 * Takes a freshly-downloaded trailer MP4 and produces a Reels/TikTok-ready
 * version: scaled-letterboxed to 1080×1920, KumoLab watermark burned in,
 * hard-trimmed to a max length. Re-encodes to H.264/AAC so output is
 * IG/TikTok/YT-compatible.
 *
 * Runs an FFmpeg subprocess via the static binary shipped by `ffmpeg-static`.
 * On Vercel the binary lives at /var/task/node_modules/ffmpeg-static/ffmpeg
 * (Linux x64); locally on Windows it's ffmpeg.exe.
 *
 * Kept stand-alone (no fluent-ffmpeg wrapper) — one filter graph, one spawn,
 * stdin/stdout for piping. Avoids touching the ephemeral filesystem on
 * Vercel except for the watermark font, which ships in `public/fonts`.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ffmpegPath = require('ffmpeg-static') as string;

const TARGET_W = 1080;
const TARGET_H = 1920;
const WATERMARK_TEXT = '@KumoLabAnime';

export interface ProcessOptions {
    maxSeconds?: number;       // hard-trim ceiling (default 60s — Reels feed video)
    aspect?: '9:16' | '16:9';  // default 9:16 (Reels/TikTok native); 16:9 keeps landscape with black bars
    addOutroCard?: boolean;    // append a 1.2s "the cloud sees everything first" outro card (default false; phase 2)
}

/**
 * Watermark + reformat + trim. Returns the processed MP4 as a Buffer, or
 * null if FFmpeg fails. On null the caller should fall back to the
 * unprocessed input rather than break the publish.
 */
export async function processForSocial(input: Buffer, opts: ProcessOptions = {}): Promise<Buffer | null> {
    const maxSeconds = opts.maxSeconds ?? 60;
    const aspect = opts.aspect ?? '9:16';

    // Use the same Outfit Black face that the still-image overlays use, so
    // the watermark looks like a continuation of the brand instead of a
    // generic system font drop.
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
    if (!fs.existsSync(fontPath)) {
        console.warn('[VideoProcessor] Outfit-Black.ttf missing — falling back to default font');
    }

    // Escape colons + backslashes for FFmpeg drawtext filter (Windows path
    // compatibility + special-character safety).
    const fontPathEscaped = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    // 9:16 path:
    //   1. Scale-letterbox the source to 1080×1920 with black bars.
    //   2. Bottom-right watermark with shadow + box for legibility.
    // 16:9 path: same watermark but no aspect rewrite.
    const scaleFilter = aspect === '9:16'
        ? `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
        : `setsar=1`;

    const drawtextFilter = [
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

    const filterComplex = `[0:v]${scaleFilter},${drawtextFilter}[v]`;

    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', 'pipe:0',
        '-t', String(maxSeconds),
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-level', '4.1',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-f', 'mp4',
        'pipe:1',
    ];

    return new Promise<Buffer | null>(resolve => {
        let proc;
        try {
            proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (e: any) {
            console.error('[VideoProcessor] spawn failed:', e?.message || e);
            resolve(null);
            return;
        }

        const chunks: Buffer[] = [];
        let stderrTail = '';

        proc.stdout.on('data', (c: Buffer) => chunks.push(c));
        proc.stderr.on('data', (c: Buffer) => {
            stderrTail = (stderrTail + c.toString()).slice(-2000);
        });

        const timer = setTimeout(() => {
            console.error('[VideoProcessor] FFmpeg exceeded 45s, killing');
            try { proc.kill('SIGKILL'); } catch { /* noop */ }
        }, 45_000);

        proc.on('error', (e: Error) => {
            clearTimeout(timer);
            console.error('[VideoProcessor] FFmpeg error:', e.message);
            resolve(null);
        });

        proc.on('close', (code: number) => {
            clearTimeout(timer);
            if (code !== 0) {
                console.error(`[VideoProcessor] FFmpeg exited ${code}. Tail:\n${stderrTail}`);
                resolve(null);
                return;
            }
            resolve(Buffer.concat(chunks));
        });

        // Pipe input to ffmpeg stdin and close.
        proc.stdin.on('error', (e: Error) => {
            // EPIPE if ffmpeg already failed/exited — log once and let the
            // close handler resolve.
            console.warn('[VideoProcessor] stdin write error:', e.message);
        });
        proc.stdin.end(input);
    });
}
