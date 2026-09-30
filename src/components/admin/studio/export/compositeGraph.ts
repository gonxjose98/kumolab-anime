/**
 * Multi-layer export plan (pure: no DOM, no ffmpeg — unit tested).
 *
 * The original exporter concatenated ONE visual track into a full-frame base
 * and ignored every other video/image track, plus each clip's position/scale.
 * That breaks layered edits such as an overlay PNG (with a transparent window)
 * sitting above a positioned video clip. This builds a single ffmpeg graph that
 * composites EVERY visible video/image clip onto a background-colour canvas in
 * the same order and geometry as PreviewCanvas:
 *
 *   • stacking: lower clip.z first, then higher track.order first (the top
 *     timeline row, order 0, is painted last = front);
 *   • geometry: `placement()` is the preview's drawTransformed math verbatim;
 *   • `contain` bars get the clip's fill (blur / black / white) painted full
 *     frame under it, or nothing for fillStyle 'none';
 *   • opacity + fades act on alpha, so lower layers show through (as in preview);
 *   • PNG transparency is kept (format=rgba into overlay).
 *
 * Audio mixes every unmuted source: the visible video clips' own audio and
 * every clip on every unmuted audio track.
 */

import type { Clip, MediaAsset, Track, Transform, VideoProject } from '../types';

export interface CompositePlan {
    /** ffmpeg input args (lavfi background first), ready to spread into exec. */
    args: string[];
    /** Assets whose bytes must be written to the ffmpeg FS as `srcName(asset)`. */
    files: MediaAsset[];
    filter: string;
    vOut: string;
    aOut: string;
    durationSec: number;
}

export const srcName = (a: MediaAsset) => `src_${a.id}`;

const num = (x: number) => String(Math.round(x * 1000) / 1000);

export function clampTempo(speed: number): string {
    // atempo supports 0.5–2.0 per stage; chain for extremes.
    if (speed >= 0.5 && speed <= 2) return String(speed);
    if (speed > 2) return `2.0,atempo=${(speed / 2).toFixed(3)}`;
    return `0.5,atempo=${(speed / 0.5).toFixed(3)}`;
}

/** ffmpeg colour syntax: '#07122B' → '0x07122B'; named colours pass through. */
export function ffColor(c: string | undefined): string {
    const v = (c || '#000000').trim();
    return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? '0x' + v.slice(1) : v.replace(/[^a-z0-9]/gi, '') || 'black';
}

const DEFAULT_TR: Transform = { xPct: 0.5, yPct: 0.5, scale: 1, rotationDeg: 0, opacity: 1, fit: 'contain' };

/** Draw rect for a source in the canvas — identical to PreviewCanvas.drawTransformed. */
export function placement(tr: Transform | undefined, sw: number, sh: number, W: number, H: number) {
    const t = tr ?? DEFAULT_TR;
    const targetAspect = W / H;
    const srcAspect = sw && sh ? sw / sh : targetAspect;
    let dw: number, dh: number;
    if (t.fit === 'cover') {
        if (srcAspect > targetAspect) { dh = H; dw = H * srcAspect; } else { dw = W; dh = W / srcAspect; }
    } else {
        if (srcAspect > targetAspect) { dw = W; dh = W / srcAspect; } else { dh = H; dw = H * srcAspect; }
    }
    dw *= t.scale ?? 1; dh *= t.scale ?? 1;
    return {
        dw: Math.max(2, Math.round(dw)),
        dh: Math.max(2, Math.round(dh)),
        cx: (t.xPct ?? 0.5) * W,
        cy: (t.yPct ?? 0.5) * H,
        bars: t.fit === 'contain' && (dw < W - 0.5 || dh < H - 0.5),
    };
}

export interface StackedClip { clip: Clip; track: Track; asset: MediaAsset }

/** Every visible visual clip with media, back-to-front (preview order). */
export function stackedVisualClips(project: VideoProject): StackedClip[] {
    const byId = new Map(project.media.map((m) => [m.id, m]));
    const out: StackedClip[] = [];
    for (const track of project.tracks) {
        if (track.hidden || (track.kind !== 'video' && track.kind !== 'image')) continue;
        for (const clip of track.clips) {
            const asset = clip.mediaId ? byId.get(clip.mediaId) : undefined;
            if (asset && asset.kind !== 'audio') out.push({ clip, track, asset });
        }
    }
    out.sort((a, b) => (a.clip.z - b.clip.z) || (b.track.order - a.track.order) || (a.clip.timelineStart - b.clip.timelineStart));
    return out;
}

const isCentredFullFrame = (t: Transform | undefined) =>
    !t || (Math.abs((t.xPct ?? 0.5) - 0.5) < 1e-3 && Math.abs((t.yPct ?? 0.5) - 0.5) < 1e-3
        && Math.abs((t.scale ?? 1) - 1) < 1e-3 && !t.rotationDeg && (t.opacity ?? 1) >= 0.999
        && t.fillStyle !== 'none');

/**
 * True when the legacy single-track path renders this project exactly: at most
 * one visible visual track, every clip centred at scale 1, opaque, no
 * transparent bars. Anything else needs the compositor.
 */
export function canUseSingleBase(project: VideoProject): boolean {
    const visualTracks = project.tracks.filter((t) => !t.hidden && (t.kind === 'video' || t.kind === 'image') && t.clips.length > 0);
    if (visualTracks.length > 1) return false;
    return (visualTracks[0]?.clips ?? []).every((c) => isCentredFullFrame(c.transform));
}

export function projectDuration(project: VideoProject): number {
    let end = project.durationSec || 0;
    for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, c.timelineStart + c.duration);
    return end || 1;
}

/** Colour effects → filter fragment with leading comma (same mapping as the base path). */
export function effectsFilter(clip: Clip): string {
    const parts: string[] = [];
    const eq: string[] = [];
    for (const fx of clip.effects || []) {
        if (fx.type === 'brightness' && fx.amount) eq.push(`brightness=${fx.amount}`);
        else if (fx.type === 'contrast' && fx.amount !== 1) eq.push(`contrast=${fx.amount}`);
        else if (fx.type === 'saturation' && fx.amount !== 1) eq.push(`saturation=${fx.amount}`);
        else if (fx.type === 'grayscale' && fx.amount > 0) parts.push('hue=s=0');
        else if (fx.type === 'blur' && fx.amount > 0) parts.push(`boxblur=${Math.round(fx.amount)}`);
    }
    if (eq.length) parts.unshift(`eq=${eq.join(':')}`);
    return parts.length ? ',' + parts.join(',') : '';
}

/** Alpha fades (the preview fades a layer's alpha, not to black). */
function alphaFades(clip: Clip): string {
    const d = clip.duration;
    const parts: string[] = [];
    if (clip.fadeIn && clip.fadeIn > 0) parts.push(`fade=t=in:st=0:d=${num(Math.min(clip.fadeIn, d))}:alpha=1`);
    if (clip.fadeOut && clip.fadeOut > 0) parts.push(`fade=t=out:st=${num(Math.max(0, d - clip.fadeOut))}:d=${num(Math.min(clip.fadeOut, d))}:alpha=1`);
    return parts.length ? ',' + parts.join(',') : '';
}

export function buildCompositePlan(project: VideoProject, W: number, H: number, fps: number): CompositePlan {
    const dur = projectDuration(project);
    const args: string[] = ['-f', 'lavfi', '-i', `color=c=${ffColor(project.meta.backgroundColor)}:s=${W}x${H}:r=${fps}:d=${num(dur)}`];
    const files: MediaAsset[] = [];
    const chains: string[] = [];
    const audio: string[] = [];
    let inputIdx = 1;

    const addFile = (a: MediaAsset) => { if (!files.some((f) => f.id === a.id)) files.push(a); };
    const audioChain = (label: string, clip: Clip, j: number) => {
        const ms = Math.round(clip.timelineStart * 1000);
        audio.push(`au${j}`);
        return `${label}atrim=start=${num(clip.srcStart)}:end=${num(clip.srcEnd)},asetpts=PTS-STARTPTS,atempo=${clampTempo(clip.speed || 1)},volume=${num(clip.volume ?? 1)},aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[au${j}]`;
    };

    let cur = '[0:v]';
    let n = 0;
    for (const { clip, track, asset } of stackedVisualClips(project)) {
        const k = inputIdx++;
        const i = n++;
        const t0 = clip.timelineStart;
        const t1 = t0 + clip.duration;
        const en = `enable='between(t,${num(t0)},${num(t1)})'`;
        const isImage = asset.kind === 'image';
        addFile(asset);
        if (isImage) args.push('-loop', '1', '-framerate', String(fps), '-t', num(clip.duration), '-i', srcName(asset));
        else args.push('-i', srcName(asset));

        const tr = clip.transform;
        const p = placement(tr, asset.width || W, asset.height || H, W, H);
        const fill = p.bars ? (tr?.fillStyle ?? 'black') : 'none';

        const head = isImage
            ? `[${k}:v]setpts=PTS-STARTPTS${effectsFilter(clip)}`
            : `[${k}:v]trim=start=${num(clip.srcStart)}:end=${num(clip.srcEnd)},setpts=(PTS-STARTPTS)/${clip.speed || 1},fps=${fps}${effectsFilter(clip)}`;
        const shift = `setpts=PTS+${num(t0)}/TB`;

        const src = `[s${i}]`;
        if (fill === 'blur') {
            chains.push(`${head},split=2[s${i}][fs${i}]`);
            const sigma = tr?.blurIntensity ?? 60;
            chains.push(`[fs${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${sigma},${shift}[fill${i}]`);
        } else {
            chains.push(`${head}[s${i}]`);
            if (fill === 'black' || fill === 'white') {
                chains.push(`color=c=${fill}:s=${W}x${H}:r=${fps}:d=${num(clip.duration)},${shift}[fill${i}]`);
            }
        }
        if (fill !== 'none') {
            chains.push(`${cur}[fill${i}]overlay=0:0:eof_action=pass:${en}[cf${i}]`);
            cur = `[cf${i}]`;
        }

        const rot = tr?.rotationDeg ? (tr.rotationDeg * Math.PI) / 180 : 0;
        const rotF = rot ? `,rotate=${num(rot)}:c=none:ow=rotw(${num(rot)}):oh=roth(${num(rot)})` : '';
        const op = tr?.opacity ?? 1;
        const opF = op < 0.999 ? `,colorchannelmixer=aa=${num(op)}` : '';
        chains.push(`${src}scale=${p.dw}:${p.dh},format=rgba${rotF}${opF}${alphaFades(clip)},${shift}[l${i}]`);
        chains.push(`${cur}[l${i}]overlay=x=${num(p.cx)}-w/2:y=${num(p.cy)}-h/2:eof_action=pass:${en}[c${i}]`);
        cur = `[c${i}]`;

        // The clip's own soundtrack (a visible, unmuted video clip).
        if (!isImage && track.kind === 'video' && asset.hasAudio && !clip.muted && !track.muted) {
            chains.push(audioChain(`[${k}:a]`, clip, audio.length));
        }
    }
    chains.push(`${cur}format=yuv420p,setsar=1[vout]`);

    // Every clip on every unmuted audio track.
    const byId = new Map(project.media.map((m) => [m.id, m]));
    for (const track of project.tracks) {
        if (track.kind !== 'audio' || track.muted) continue;
        for (const clip of track.clips) {
            const asset = clip.mediaId ? byId.get(clip.mediaId) : undefined;
            if (!asset || clip.muted) continue;
            addFile(asset);
            const k = inputIdx++;
            args.push('-i', srcName(asset));
            chains.push(audioChain(`[${k}:a]`, clip, audio.length));
        }
    }

    if (audio.length === 0) chains.push('anullsrc=r=48000:cl=stereo[aout]');
    else if (audio.length === 1) chains.push(`[${audio[0]}]anull[aout]`);
    else chains.push(`${audio.map((a) => `[${a}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest[aout]`);

    return { args, files, filter: chains.join(';'), vOut: '[vout]', aOut: '[aout]', durationSec: dur };
}
