'use client';

import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegClient';
import { getBlob } from '../store/blobStore';
import { useMediaStore } from '../store/mediaStore';
import type { VideoProject, Clip, Track, MediaAsset, TextStyle, Transform } from '../types';

export interface ExportOptions {
    width: number;
    height: number;
    fps: number;
    onProgress?: (ratio: number, stage: string) => void;
    onLog?: (msg: string) => void;
    signal?: AbortSignal;
}

const VCODEC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1'];
const ACODEC = ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];

/** Resolve the raw bytes for a media asset (IndexedDB cache → remote fetch). */
async function assetBytes(asset: MediaAsset): Promise<Uint8Array> {
    const key = asset.opfsKey || asset.id;
    let blob = await getBlob(key).catch(() => null);
    if (!blob) {
        const url = useMediaStore.getState().getUrl(asset.id) || asset.remoteUrl;
        if (!url) throw new Error(`No bytes for media ${asset.name}`);
        blob = await (await fetch(url)).blob();
    }
    return fetchFile(blob);
}

/** contain-with-blur / contain-solid / cover video filter to WxH. */
function fitFilter(tr: Transform | undefined, W: number, H: number): string {
    const t = tr ?? ({ fit: 'contain', fillStyle: 'blur', blurIntensity: 20 } as Transform);
    if (t.fit === 'cover') {
        return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
    }
    if (t.fillStyle === 'blur') {
        const s = t.blurIntensity ?? 20;
        return `split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${s}[bgb];[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2`;
    }
    const color = t.fillStyle === 'white' ? 'white' : 'black';
    return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${color}`;
}

/** Render a text clip to a full-frame transparent PNG (overlaid at 0,0). */
function textPng(clip: Clip, W: number, H: number): Promise<Uint8Array> {
    const ts = clip.text as TextStyle;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const fontPx = ts.sizePct * H;
    ctx.font = `${ts.weight ?? 800} ${fontPx}px ${ts.fontFamily || 'Inter, system-ui, sans-serif'}`;
    ctx.textAlign = (ts.align ?? 'center') as CanvasTextAlign;
    ctx.textBaseline = 'middle';
    const x = (clip.transform?.xPct ?? 0.5) * W;
    const y = (clip.transform?.yPct ?? 0.5) * H;
    if (ts.bg) {
        const m = ctx.measureText(ts.text);
        const pad = fontPx * 0.25;
        ctx.fillStyle = ts.bg;
        ctx.fillRect(x - m.width / 2 - pad, y - fontPx / 2 - pad, m.width + pad * 2, fontPx + pad * 2);
    }
    if (ts.strokePx) {
        ctx.lineWidth = ts.strokePx * (fontPx / 40);
        ctx.strokeStyle = ts.strokeColor || 'rgba(0,0,0,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(ts.text, x, y);
    }
    ctx.fillStyle = ts.color;
    ctx.fillText(ts.text, x, y);
    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
            if (!b) return reject(new Error('text render failed'));
            b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
        }, 'image/png');
    });
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('Export cancelled');
}

/**
 * Render a project to a 1080x1920 (or preset) H.264/AAC MP4 Blob.
 *
 * Stages: (1) normalize each video/image clip on the video track — plus black
 * gap fillers — into uniform segments; (2) concat them into a base timeline;
 * (3) overlay text PNGs; (4) mix in the audio track. Each stage is a discrete
 * ffmpeg.exec so failures are localizable and the graph stays simple.
 */
export async function renderProject(project: VideoProject, opts: ExportOptions): Promise<Blob> {
    const { width: W, height: H, fps, onProgress, onLog, signal } = opts;
    const ffmpeg = await getFFmpeg(onLog);
    const report = (r: number, s: string) => onProgress?.(Math.max(0, Math.min(1, r)), s);

    const mediaById = new Map(project.media.map((m) => [m.id, m]));
    const videoTracks = project.tracks.filter((t) => t.kind === 'video' || t.kind === 'image').sort((a, b) => a.order - b.order);
    const textClips: Clip[] = project.tracks.filter((t) => t.kind === 'text' && !t.hidden).flatMap((t) => t.clips);
    const audioTrack = project.tracks.find((t) => t.kind === 'audio' && !t.muted);

    // For M3 the base sequence is the primary (top) video/image track.
    const baseTrack: Track | undefined = videoTracks.find((t) => !t.hidden);
    const baseClips = (baseTrack?.clips ?? []).slice().sort((a, b) => a.timelineStart - b.timelineStart);
    const totalDur = Math.max(project.durationSec, baseClips.reduce((mx, c) => Math.max(mx, c.timelineStart + c.duration), 0)) || 1;

    report(0.02, 'Loading engine');
    throwIfAborted(signal);

    // ── Stage 1: normalized segments (+ black gap fillers) ──────────────────
    const segList: string[] = [];
    let segIdx = 0;
    let cursor = 0;
    const writeBlackSeg = async (dur: number) => {
        if (dur < 0.03) return;
        const name = `seg_${segIdx++}.mp4`;
        await ffmpeg.exec([
            '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${fps}:d=${dur.toFixed(3)}`,
            '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`,
            '-t', dur.toFixed(3), '-map', '0:v', '-map', '1:a', ...VCODEC, ...ACODEC, '-shortest', name,
        ]);
        segList.push(name);
    };

    for (let i = 0; i < baseClips.length; i++) {
        throwIfAborted(signal);
        const clip = baseClips[i];
        if (clip.timelineStart > cursor + 0.03) await writeBlackSeg(clip.timelineStart - cursor);
        const asset = clip.mediaId ? mediaById.get(clip.mediaId) : undefined;
        const outName = `seg_${segIdx++}.mp4`;
        const clipDur = clip.duration;

        if (!asset) { await writeBlackSeg(clipDur); cursor = clip.timelineStart + clipDur; continue; }

        const inName = `src_${asset.id}`;
        if (!(await fileExists(ffmpeg, inName))) await ffmpeg.writeFile(inName, await assetBytes(asset));

        const hasAudio = asset.kind === 'video' && asset.hasAudio && !clip.muted;
        const vBase = asset.kind === 'image'
            ? `${fitFilter(clip.transform, W, H)}`
            : `trim=start=${clip.srcStart}:end=${clip.srcEnd},setpts=(PTS-STARTPTS)/${clip.speed},${fitFilter(clip.transform, W, H)}`;
        const vChain = `[0:v]${vBase},fps=${fps},format=yuv420p,setsar=1[v]`;

        const args: string[] = [];
        if (asset.kind === 'image') { args.push('-loop', '1', '-t', clipDur.toFixed(3), '-i', inName); }
        else { args.push('-i', inName); }

        let filter = vChain;
        let aMap = '';
        if (hasAudio) {
            filter += `;[0:a]atrim=start=${clip.srcStart}:end=${clip.srcEnd},asetpts=PTS-STARTPTS,atempo=${clampTempo(clip.speed)},volume=${clip.volume}[a]`;
            aMap = '[a]';
        } else {
            args.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`);
            aMap = asset.kind === 'image' ? '1:a' : '1:a';
        }

        await ffmpeg.exec([
            ...args, '-filter_complex', filter,
            '-map', '[v]', '-map', aMap, '-t', clipDur.toFixed(3),
            ...VCODEC, ...ACODEC, '-shortest', outName,
        ]);
        segList.push(outName);
        cursor = clip.timelineStart + clipDur;
        report(0.05 + 0.5 * ((i + 1) / Math.max(1, baseClips.length)), 'Rendering clips');
    }

    if (segList.length === 0) { await writeBlackSeg(totalDur); }

    // ── Stage 2: concat → base.mp4 ──────────────────────────────────────────
    throwIfAborted(signal);
    report(0.58, 'Sequencing');
    const listTxt = segList.map((s) => `file '${s}'`).join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(listTxt));
    let baseName = 'base.mp4';
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', baseName]);

    // ── Stage 3: text overlays ──────────────────────────────────────────────
    if (textClips.length) {
        throwIfAborted(signal);
        report(0.7, 'Adding text');
        const inputs = ['-i', baseName];
        const parts: string[] = [];
        let last = '[0:v]';
        for (let i = 0; i < textClips.length; i++) {
            const c = textClips[i];
            const png = await textPng(c, W, H);
            const pngName = `txt_${i}.png`;
            await ffmpeg.writeFile(pngName, png);
            inputs.push('-i', pngName);
            const out = `[vt${i}]`;
            const a = c.timelineStart.toFixed(3);
            const b = (c.timelineStart + c.duration).toFixed(3);
            parts.push(`${last}[${i + 1}:v]overlay=0:0:enable='between(t,${a},${b})'${out}`);
            last = out;
        }
        const outName = 'base_txt.mp4';
        await ffmpeg.exec([...inputs, '-filter_complex', parts.join(';'), '-map', last, '-map', '0:a', ...VCODEC, '-c:a', 'copy', outName]);
        baseName = outName;
    }

    // ── Stage 4: audio track mix ────────────────────────────────────────────
    if (audioTrack && audioTrack.clips.length) {
        throwIfAborted(signal);
        report(0.85, 'Mixing audio');
        const inputs = ['-i', baseName];
        const chains: string[] = [];
        const labels: string[] = ['[0:a]'];
        let idx = 1;
        for (const c of audioTrack.clips) {
            const asset = c.mediaId ? mediaById.get(c.mediaId) : undefined;
            if (!asset) continue;
            const inName = `asrc_${asset.id}`;
            if (!(await fileExists(ffmpeg, inName))) await ffmpeg.writeFile(inName, await assetBytes(asset));
            inputs.push('-i', inName);
            const delayMs = Math.round(c.timelineStart * 1000);
            chains.push(`[${idx}:a]atrim=start=${c.srcStart}:end=${c.srcEnd},asetpts=PTS-STARTPTS,volume=${c.volume},adelay=${delayMs}|${delayMs}[a${idx}]`);
            labels.push(`[a${idx}]`);
            idx++;
        }
        if (labels.length > 1) {
            const filter = `${chains.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first[aout]`;
            const outName = 'final.mp4';
            await ffmpeg.exec([...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', ...ACODEC, '-movflags', '+faststart', outName]);
            baseName = outName;
        }
    }

    // Ensure faststart on the final container.
    throwIfAborted(signal);
    report(0.95, 'Finalizing');
    if (baseName !== 'final.mp4') {
        await ffmpeg.exec(['-i', baseName, '-c', 'copy', '-movflags', '+faststart', 'final.mp4']);
        baseName = 'final.mp4';
    }

    const data = await ffmpeg.readFile('final.mp4');
    report(1, 'Done');
    const uint = data as Uint8Array;
    return new Blob([uint], { type: 'video/mp4' });
}

function clampTempo(speed: number): string {
    // atempo supports 0.5–2.0 per stage; chain for extremes.
    if (speed >= 0.5 && speed <= 2) return String(speed);
    if (speed > 2) return `2.0,atempo=${(speed / 2).toFixed(3)}`;
    return `0.5,atempo=${(speed / 0.5).toFixed(3)}`;
}

async function fileExists(ffmpeg: any, name: string): Promise<boolean> {
    try { await ffmpeg.readFile(name); return true; } catch { return false; }
}
