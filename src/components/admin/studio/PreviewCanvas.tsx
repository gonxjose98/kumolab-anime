'use client';

import { useEffect, useRef } from 'react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { useMediaStore } from './store/mediaStore';
import type { Clip, ClipEffectType, Track, Transform, VideoProject } from './types';

/**
 * Live compositor. Draws the frame at the current playhead by stacking each
 * track's active clip onto a canvas (no re-encoding — that's Export's job).
 *
 * One shared <video> element per video/image-with-motion media asset is pooled
 * off-DOM. During playback the active clip's element is play()'d and drift-
 * corrected; while paused we seek it to the exact frame. Text clips are painted
 * with the same normalized centre-based math as the exporter, so preview and
 * output agree.
 */
export default function PreviewCanvas() {
    const project = useProjectStore((s) => s.project);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const poolRef = useRef<HTMLDivElement | null>(null);
    const videoPool = useRef<Map<string, HTMLVideoElement>>(new Map());
    const imagePool = useRef<Map<string, HTMLImageElement>>(new Map());
    const rafRef = useRef<number>(0);

    const cw = project?.meta.canvasWidth ?? 1080;
    const ch = project?.meta.canvasHeight ?? 1920;

    // Build/refresh the media element pool when media changes.
    useEffect(() => {
        if (!project) return;
        const media = useMediaStore.getState();
        let cancelled = false;
        (async () => {
            for (const asset of project.media) {
                if (asset.kind === 'video' && !videoPool.current.has(asset.id)) {
                    try {
                        const url = await media.resolve(asset);
                        if (cancelled) return;
                        const v = document.createElement('video');
                        v.src = url;
                        v.crossOrigin = 'anonymous';
                        v.preload = 'auto';
                        v.playsInline = true;
                        v.muted = true;
                        // Mount hidden in the DOM so the browser reliably decodes
                        // frames (detached video elements often won't paint to canvas).
                        poolRef.current?.appendChild(v);
                        // Nudge a decode of frame 0 so the first paint isn't black.
                        v.addEventListener('loadeddata', () => { try { v.currentTime = 0.001; } catch { /* noop */ } }, { once: true });
                        videoPool.current.set(asset.id, v);
                    } catch (e) { console.warn('[studio] media load failed', asset.id, e); }
                } else if (asset.kind === 'image' && !imagePool.current.has(asset.id)) {
                    try {
                        const url = await media.resolve(asset);
                        if (cancelled) return;
                        const img = new Image();
                        img.src = url;
                        imagePool.current.set(asset.id, img);
                    } catch (e) { console.warn('[studio] image load failed', asset.id, e); }
                }
            }
        })();
        return () => { cancelled = true; };
    }, [project?.media]);

    // The draw + playback loop.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !project) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastWall = performance.now();

        const activeClipsAt = (p: VideoProject, t: number): { clip: Clip; track: Track }[] => {
            const out: { clip: Clip; track: Track }[] = [];
            for (const track of p.tracks) {
                if (track.hidden) continue;
                for (const clip of track.clips) {
                    if (t >= clip.timelineStart && t < clip.timelineStart + clip.duration) {
                        out.push({ clip, track });
                    }
                }
            }
            // Paint back-to-front: lower z first, then by track order (top track last = front).
            out.sort((a, b) => (a.clip.z - b.clip.z) || (b.track.order - a.track.order));
            return out;
        };

        // Build a CSS filter string from a clip's colour/blur effects so the
        // live preview matches what the exporter bakes in (WYSIWYG). Without
        // this the Blur / Brightness / Contrast / Saturation / Grayscale sliders
        // changed nothing on screen and only appeared after export.
        const effectFilter = (effects: Clip['effects']): string => {
            if (!effects || !effects.length) return 'none';
            const get = (t: ClipEffectType, neutral: number) => {
                const e = effects.find((x) => x.type === t);
                return e ? e.amount : neutral;
            };
            const b = get('brightness', 0), c = get('contrast', 1), s = get('saturation', 1);
            const g = get('grayscale', 0), bl = get('blur', 0);
            const parts: string[] = [];
            if (b !== 0) parts.push(`brightness(${(1 + b).toFixed(3)})`);
            if (c !== 1) parts.push(`contrast(${c.toFixed(3)})`);
            if (s !== 1) parts.push(`saturate(${s.toFixed(3)})`);
            if (g > 0) parts.push(`grayscale(${Math.min(1, g)})`);
            if (bl > 0) parts.push(`blur(${bl}px)`);
            return parts.length ? parts.join(' ') : 'none';
        };

        const drawTransformed = (
            src: CanvasImageSource, sw: number, sh: number, tr: Transform | undefined, filter: string = 'none',
        ) => {
            const transform: Transform = tr ?? { xPct: 0.5, yPct: 0.5, scale: 1, rotationDeg: 0, opacity: 1, fit: 'contain' };
            const targetAspect = cw / ch;
            const srcAspect = sw && sh ? sw / sh : targetAspect;
            let dw: number, dh: number;
            if (transform.fit === 'cover') {
                if (srcAspect > targetAspect) { dh = ch; dw = ch * srcAspect; } else { dw = cw; dh = cw / srcAspect; }
            } else {
                if (srcAspect > targetAspect) { dw = cw; dh = cw / srcAspect; } else { dh = ch; dw = ch * srcAspect; }
            }
            dw *= transform.scale; dh *= transform.scale;
            const cx = transform.xPct * cw;
            const cy = transform.yPct * ch;

            // Background fill for contain bars.
            if (transform.fit === 'contain' && (dw < cw || dh < ch)) {
                if (transform.fillStyle === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
                else if (transform.fillStyle === 'blur') {
                    ctx.save();
                    ctx.filter = `blur(${(transform.blurIntensity ?? 20)}px)`;
                    // cover-draw a blurred copy behind
                    let bw: number, bh: number;
                    if (srcAspect > targetAspect) { bh = ch; bw = ch * srcAspect; } else { bw = cw; bh = cw / srcAspect; }
                    ctx.drawImage(src, (cw - bw) / 2, (ch - bh) / 2, bw, bh);
                    ctx.restore();
                } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); }
            }

            ctx.save();
            ctx.globalAlpha = transform.opacity ?? 1;
            ctx.filter = filter; // brightness/contrast/saturation/grayscale/blur
            ctx.translate(cx, cy);
            if (transform.rotationDeg) ctx.rotate((transform.rotationDeg * Math.PI) / 180);
            ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        };

        // Burn the @kumolabanime handle bottom-right, matching the exporter, so
        // the operator sees the watermark before exporting (toggle in the
        // timeline bar). Purely a preview overlay; export draws its own.
        const drawWatermark = () => {
            ctx.save();
            const fs = Math.round(ch * 0.024);
            ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = fs * 0.35;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText('@kumolabanime', cw - ch * 0.018, ch - ch * 0.018);
            ctx.restore();
        };

        const drawText = (clip: Clip) => {
            const ts = clip.text;
            if (!ts) return;
            const fontPx = ts.sizePct * ch;
            ctx.save();
            ctx.font = `${ts.weight ?? 800} ${fontPx}px ${ts.fontFamily || 'Inter, system-ui, sans-serif'}`;
            ctx.textAlign = (ts.align ?? 'center') as CanvasTextAlign;
            ctx.textBaseline = 'middle';
            const x = (clip.transform?.xPct ?? 0.5) * cw;
            const y = (clip.transform?.yPct ?? 0.5) * ch;
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
            ctx.restore();
        };

        const renderFrame = (t: number) => {
            const p = useProjectStore.getState().project;
            if (!p) return;
            ctx.fillStyle = p.meta.backgroundColor || '#000';
            ctx.fillRect(0, 0, cw, ch);
            for (const { clip, track } of activeClipsAt(p, t)) {
                if (track.kind === 'text') { drawText(clip); continue; }
                if (track.kind === 'audio') continue;
                const filter = effectFilter(clip.effects);
                if (clip.mediaId && track.kind === 'video') {
                    const v = videoPool.current.get(clip.mediaId);
                    if (v && v.readyState >= 2) drawTransformed(v, v.videoWidth, v.videoHeight, clip.transform, filter);
                } else if (clip.mediaId && track.kind === 'image') {
                    const img = imagePool.current.get(clip.mediaId);
                    if (img && img.complete) drawTransformed(img, img.naturalWidth, img.naturalHeight, clip.transform, filter);
                }
            }
            if (p.meta.watermark) drawWatermark();
        };

        const syncVideos = (t: number, playing: boolean) => {
            const p = useProjectStore.getState().project;
            if (!p) return;
            const active = new Set<string>();
            for (const { clip, track } of activeClipsAt(p, t)) {
                if (track.kind !== 'video' || !clip.mediaId) continue;
                const v = videoPool.current.get(clip.mediaId);
                if (!v) continue;
                active.add(clip.mediaId);
                const local = clip.srcStart + (t - clip.timelineStart) * clip.speed;
                v.playbackRate = clip.speed;
                v.muted = clip.muted || track.muted;
                v.volume = clip.volume ?? 1;
                if (playing) {
                    if (Math.abs(v.currentTime - local) > 0.25) v.currentTime = local;
                    if (v.paused) v.play().catch(() => {});
                } else {
                    if (Math.abs(v.currentTime - local) > 0.04) v.currentTime = local;
                    if (!v.paused) v.pause();
                }
            }
            // Pause any non-active videos.
            for (const [id, v] of videoPool.current) if (!active.has(id) && !v.paused) v.pause();
        };

        const tick = () => {
            const pb = usePlaybackStore.getState();
            const now = performance.now();
            const dt = (now - lastWall) / 1000;
            lastWall = now;
            let t = pb.currentTime;
            if (pb.isPlaying) {
                t += dt;
                const dur = useProjectStore.getState().project?.durationSec ?? 0;
                if (t >= dur) { t = dur; usePlaybackStore.getState().pause(); }
                usePlaybackStore.getState().setCurrentTime(t);
            }
            syncVideos(t, pb.isPlaying);
            renderFrame(t);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [project, cw, ch]);

    // Teardown media elements on unmount.
    useEffect(() => () => {
        for (const v of videoPool.current.values()) { v.pause(); v.removeAttribute('src'); v.load(); }
        videoPool.current.clear();
        imagePool.current.clear();
    }, []);

    return (
        <div className="st-stage" style={{ aspectRatio: `${cw} / ${ch}` }}>
            <canvas ref={canvasRef} width={cw} height={ch} />
            {/* Hidden decode pool — video sources must live in the DOM to paint. */}
            <div ref={poolRef} aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} />
        </div>
    );
}
