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
const WATERMARK_TEXT = '@kumolabanime';

/**
 * Render the watermark text into a transparent PNG using @napi-rs/canvas,
 * which the rest of the codebase already uses (same Outfit-Black font as
 * the image overlays). We pre-render to PNG instead of using FFmpeg's
 * `drawtext` filter because Vercel's bundled ffmpeg-static was built
 * without libfreetype — drawtext fails with "No such filter: drawtext".
 * The standard `overlay` filter accepts a PNG input and is always
 * present in any ffmpeg build.
 *
 * Cached at module scope per process. Re-renders on cold start but is
 * cheap (~50ms for this tiny canvas).
 */
let cachedWatermarkPng: Buffer | null = null;
async function getWatermarkPng(): Promise<Buffer> {
    if (cachedWatermarkPng) return cachedWatermarkPng;
    const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas');

    const outfitPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
    if (fs.existsSync(outfitPath)) {
        if (!GlobalFonts.registerFromPath(outfitPath, 'Outfit')) {
            const fontBuffer = fs.readFileSync(outfitPath);
            GlobalFonts.register(fontBuffer, 'Outfit');
        }
    }

    const W = 600;
    const H = 110;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.font = '700 56px Outfit, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Black halo for legibility against bright frames
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.strokeText(WATERMARK_TEXT, 12, H / 2);
    // Reset shadow before white fill so it doesn't double-render
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(WATERMARK_TEXT, 12, H / 2);

    const png = await canvas.encode('png');
    cachedWatermarkPng = Buffer.from(png);
    return cachedWatermarkPng;
}

export type FillStyle = 'black' | 'white' | 'blur';

export interface TextOverlayInput {
    /** The text to burn in (may contain emoji). */
    text: string;
    /** Centre X as a fraction (0–1) of the 1080×1920 canvas. */
    xPct: number;
    /** Centre Y as a fraction (0–1) of the 1080×1920 canvas. */
    yPct: number;
    /** Hex colour, e.g. "#ffffff". */
    color: string;
    /** Font size as a fraction of canvas height (0.02–0.12). */
    sizePct: number;
}

export interface TrimOptions {
    /** Seconds into the source to start. Use 0 for "from beginning". */
    trimStart: number;
    /** Seconds into the source to end at. Use sourceDuration for "to end". */
    trimEnd: number;
    /** Burn @kumolabanime into the bottom-right corner. Default off. */
    watermark: boolean;
    /**
     * Background Fill — when true, fit the FULL clip (no crop/zoom) inside a
     * true 9:16 (1080×1920) canvas and fill the empty top/bottom space with
     * `fillStyle`. When false (default), the source aspect ratio is preserved
     * and no 9:16 conversion happens — the historical editor behavior.
     */
    backgroundFill?: boolean;
    /** Fill colour/style for the empty canvas space. Default 'white'. */
    fillStyle?: FillStyle;
    /** gblur sigma for the 'blur' fill (clamped 2–40). Default 20. */
    blurIntensity?: number;
    /**
     * Text overlays burned into the export. Positions are normalised to the
     * 1080×1920 canvas, so any overlay forces the 9:16 canvas (black fill when
     * Background Fill is off) so the text has somewhere to sit.
     */
    textOverlays?: TextOverlayInput[];
}

const FILL_W = 1080;
const FILL_H = 1920;

const clamp01 = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, typeof v === 'number' && isFinite(v) ? v : min));

// Accept only #rgb / #rrggbb; fall back to white. Guards the canvas fillStyle
// against anything weird arriving from the client.
function sanitizeColor(c: string): string {
    return typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim() : '#ffffff';
}

// Register the display font + the bundled colour-emoji font once. Vercel's
// Linux runtime has NO colour-emoji font, so emoji in burned text would render
// as tofu without this. @napi-rs/canvas (Skia) renders Noto Color Emoji's
// colour glyphs natively — verified by rendering a sample PNG.
let overlayFontsRegistered = false;
function registerOverlayFonts(GlobalFonts: any) {
    if (overlayFontsRegistered) return;
    const outfitPath = path.join(process.cwd(), 'public', 'fonts', 'Outfit-Black.ttf');
    if (fs.existsSync(outfitPath)) {
        if (!GlobalFonts.registerFromPath(outfitPath, 'Outfit')) {
            try { GlobalFonts.register(fs.readFileSync(outfitPath), 'Outfit'); } catch { /* noop */ }
        }
    }
    const emojiPath = path.join(process.cwd(), 'public', 'fonts', 'NotoColorEmoji.ttf');
    if (fs.existsSync(emojiPath)) {
        if (!GlobalFonts.registerFromPath(emojiPath, 'Noto Color Emoji')) {
            try { GlobalFonts.register(fs.readFileSync(emojiPath), 'Noto Color Emoji'); } catch { /* noop */ }
        }
    }
    overlayFontsRegistered = true;
}

/**
 * Composite every text overlay onto a single transparent 1080×1920 PNG, so
 * the FFmpeg side only needs one extra input + one overlay=0:0 (vs N inputs).
 * Each block is drawn centred at (xPct, yPct) with a dark halo for legibility,
 * and emoji render in colour via the bundled Noto font. Returns null when
 * there's nothing to draw.
 */
async function renderTextOverlaysPng(overlays: TextOverlayInput[] | undefined): Promise<Buffer | null> {
    const valid = (overlays || []).filter(
        (o) => o && typeof o.text === 'string' && o.text.trim().length > 0,
    );
    if (valid.length === 0) return null;

    const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas');
    registerOverlayFonts(GlobalFonts);

    const canvas = createCanvas(FILL_W, FILL_H);
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const o of valid) {
        const fontPx = Math.round(clamp01(o.sizePct, 0.02, 0.12) * FILL_H);
        ctx.font = `800 ${fontPx}px Outfit, "Noto Color Emoji", sans-serif`;
        const x = clamp01(o.xPct, 0, 1) * FILL_W;
        const y = clamp01(o.yPct, 0, 1) * FILL_H;
        const text = o.text.trim();

        // Dark halo (stroke + shadow) so light text stays legible over a
        // bright clip or a white fill bar.
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, fontPx * 0.12);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = fontPx * 0.18;
        ctx.shadowOffsetY = Math.round(fontPx * 0.03);
        ctx.strokeText(text, x, y);

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = sanitizeColor(o.color);
        ctx.fillText(text, x, y);
    }

    return canvas.toBuffer('image/png');
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
/**
 * Compose the video filter chain. Returns the chain segments joined later
 * into -filter_complex, plus the label of the final video stream. Built
 * from two optional stages, in order:
 *
 *   1. Background Fill — fit the full clip inside 1080×1920 (no crop) and
 *      fill the gaps. 'black'/'white' use scale+pad; 'blur' splits the
 *      source, makes a zoomed-cover blurred copy as the backdrop, and
 *      overlays the contained clip centered on top. Only filters present
 *      in every ffmpeg-static build are used (split/scale/crop/pad/gblur/
 *      overlay) — drawtext/libfreetype are NOT available here.
 *   2. Watermark — overlays the pre-rendered PNG bottom-right.
 *
 * If neither stage applies the source stream [0:v] is returned untouched
 * (the caller then takes the stream-copy fast path).
 */
function buildVideoFilter(
    opts: TrimOptions,
    hasWatermark: boolean,
    hasText: boolean,
    wmInputIdx: number,
    textInputIdx: number,
): { chain: string[]; finalLabel: string } {
    const chain: string[] = [];
    let label = '[0:v]';

    // Text overlays are positioned on the 1080×1920 canvas, so any text forces
    // the fill stage (black fill when Background Fill is off) — that's what
    // gives the text its canvas to sit on.
    const useCanvas = !!opts.backgroundFill || hasText;

    if (useCanvas) {
        const style: FillStyle = opts.backgroundFill ? (opts.fillStyle || 'white') : 'black';
        if (style === 'blur') {
            const sigma = Math.min(40, Math.max(2, Math.round(opts.blurIntensity ?? 20)));
            // Split source → cover-blurred backdrop + contained foreground,
            // then center the foreground over the backdrop.
            chain.push('[0:v]split=2[bg][fg]');
            chain.push(`[bg]scale=${FILL_W}:${FILL_H}:force_original_aspect_ratio=increase,crop=${FILL_W}:${FILL_H},gblur=sigma=${sigma}[bgb]`);
            chain.push(`[fg]scale=${FILL_W}:${FILL_H}:force_original_aspect_ratio=decrease[fgs]`);
            chain.push('[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[vf]');
        } else {
            // black | white — solid pad around the contained clip.
            const color = style === 'black' ? 'black' : 'white';
            chain.push(`[0:v]scale=${FILL_W}:${FILL_H}:force_original_aspect_ratio=decrease,pad=${FILL_W}:${FILL_H}:(ow-iw)/2:(oh-ih)/2:color=${color},setsar=1[vf]`);
        }
        label = '[vf]';
    }

    if (hasWatermark) {
        // overlay is always present (unlike drawtext). Watermark sits
        // bottom-right of whatever canvas the fill stage produced.
        chain.push(`${label}[${wmInputIdx}:v]overlay=W-w-30:H-h-40[vw]`);
        label = '[vw]';
    }

    if (hasText) {
        // The text PNG is a full 1080×1920 canvas, so overlay at 0:0. Sits on
        // top of the fill + watermark.
        chain.push(`${label}[${textInputIdx}:v]overlay=0:0[vt]`);
        label = '[vt]';
    }

    return { chain, finalLabel: label };
}

function buildArgs(
    opts: TrimOptions,
    watermarkPath: string | null,
    textPath: string | null,
    inputPath: string,
    outputPath: string,
): string[] {
    const duration = Math.max(0, opts.trimEnd - opts.trimStart);
    const hasWatermark = !!(opts.watermark && watermarkPath);
    const hasText = !!textPath;
    const needsReencode = hasWatermark || !!opts.backgroundFill || hasText;

    // Fast path: nothing to bake in → stream-copy. Fast-seek + duration.
    if (!needsReencode) {
        return [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-ss', opts.trimStart.toFixed(3),
            '-i', inputPath,
            '-t', duration.toFixed(3),
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath,
        ];
    }

    // Input order: video (0), watermark PNG (1 if present), text PNG (next).
    const wmInputIdx = 1;
    const textInputIdx = hasWatermark ? 2 : 1;
    const { chain, finalLabel } = buildVideoFilter(opts, hasWatermark, hasText, wmInputIdx, textInputIdx);

    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', opts.trimStart.toFixed(3),
        '-i', inputPath,
    ];
    if (hasWatermark) args.push('-i', watermarkPath!);
    if (hasText) args.push('-i', textPath!);
    args.push(
        '-t', duration.toFixed(3),
        '-filter_complex', chain.join(';'),
        '-map', finalLabel,
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-level', '4.1',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outputPath,
    );
    return args;
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

        // 90s was too tight: a long clip (100s+) with a blur fill re-encodes
        // far slower on Vercel's serverless CPU than locally, blowing past the
        // kill timer → "ffmpeg exited null: no stderr". The route allows 300s,
        // so give FFmpeg 230s and leave headroom for the bucket download +
        // upload around it.
        const FFMPEG_TIMEOUT_MS = 230_000;
        const timer = setTimeout(() => {
            console.error(`[VideoTrim] FFmpeg exceeded ${FFMPEG_TIMEOUT_MS / 1000}s, killing`);
            try { proc.kill('SIGKILL'); } catch { /* noop */ }
        }, FFMPEG_TIMEOUT_MS);

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

    // Vercel /tmp is writable (512 MB) and the only place we can use
    // seekable file I/O. Both -movflags +faststart on output and fast-seek
    // -ss on input require real files — they fail on stdin/stdout pipes.
    const tmpDir = os.tmpdir();
    const tmpId = crypto.randomBytes(6).toString('hex');
    const inputPath = path.join(tmpDir, `trim-in-${tmpId}.mp4`);
    const outputPath = path.join(tmpDir, `trim-out-${tmpId}.mp4`);
    const watermarkPath = path.join(tmpDir, `trim-wm-${tmpId}.png`);
    const textPath = path.join(tmpDir, `trim-txt-${tmpId}.png`);

    const cleanup = () => {
        try { fs.unlinkSync(inputPath); } catch { /* noop */ }
        try { fs.unlinkSync(outputPath); } catch { /* noop */ }
        try { fs.unlinkSync(watermarkPath); } catch { /* noop */ }
        try { fs.unlinkSync(textPath); } catch { /* noop */ }
    };

    let watermarkOnDisk: string | null = null;
    if (opts.watermark) {
        try {
            const png = await getWatermarkPng();
            fs.writeFileSync(watermarkPath, png);
            watermarkOnDisk = watermarkPath;
        } catch (e: any) {
            console.warn('[VideoTrim] Watermark PNG render failed:', e?.message || e);
            // Fall through — watermarkOnDisk stays null, ffmpeg runs trim-only.
        }
    }

    // Composite all text overlays into one 1080×1920 transparent PNG.
    let textOnDisk: string | null = null;
    try {
        const png = await renderTextOverlaysPng(opts.textOverlays);
        if (png) {
            fs.writeFileSync(textPath, png);
            textOnDisk = textPath;
        }
    } catch (e: any) {
        console.warn('[VideoTrim] Text overlay PNG render failed:', e?.message || e);
        // Fall through — textOnDisk stays null, text is simply not burned in.
    }

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

    const args = buildArgs(opts, watermarkOnDisk, textOnDisk, inputPath, outputPath);
    const ff = await runFfmpegFileIO(args);
    if (ff.exitCode !== 0 || !fs.existsSync(outputPath)) {
        // exitCode null + no stderr + no spawn error == we SIGKILLed it on the
        // timeout. Surface a useful, actionable message instead of the raw
        // "ffmpeg exited null: no stderr".
        const timedOut = ff.exitCode === null && !ff.spawnError && !ff.stderrTail.trim();
        const summary = ff.spawnError
            ? `spawn failed: ${ff.spawnError}`
            : timedOut
                ? 'processing timed out — the clip is likely too long for this effect'
                : `ffmpeg exited ${ff.exitCode}: ${ff.stderrTail.slice(-400) || 'no stderr'}`;
        cleanup();
        await logError({
            source: 'video-trim.ffmpeg',
            errorMessage: `FFmpeg failed — ${summary}`,
            context: { postId, opts, ffmpegArgs: args },
        }).catch(() => {});
        const userMsg = timedOut
            ? 'Video processing timed out — the clip may be too long, especially with a Blur fill. Trim it shorter (use the Trim handles), then Apply again.'
            : `Video processing failed — ${summary.slice(0, 200)}`;
        return { error: userMsg };
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
