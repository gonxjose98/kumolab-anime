'use client';

import { useEffect, useRef } from 'react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { useMediaStore } from './store/mediaStore';
import type { Clip, ClipEffectType, Track, Transform, VideoProject } from './types';
import { paintText } from './paintText';

/**
 * Does `ctx.filter` actually blur, or is it silently ignored?
 *
 * Tested FUNCTIONALLY (blur one pixel, check the light spread to a neighbour)
 * rather than by sniffing the browser or reading the property back: Safari has
 * historically parsed `filter` and then ignored it, so both of those lie.
 * Result is cached — this runs once, not per frame.
 */
let canvasBlurSupport: boolean | null = null;
function canvasBlurWorks(): boolean {
    if (canvasBlurSupport !== null) return canvasBlurSupport;
    try {
        const c = document.createElement('canvas');
        c.width = 9; c.height = 9;
        const x = c.getContext('2d', { willReadFrequently: true });
        if (!x) { canvasBlurSupport = false; return false; }
        x.filter = 'blur(2px)';
        x.fillStyle = '#fff';
        x.fillRect(4, 4, 1, 1);
        x.filter = 'none';
        // Two pixels away should have picked up light if the blur ran.
        const alpha = x.getImageData(6, 4, 1, 1).data[3];
        canvasBlurSupport = alpha > 0;
    } catch {
        canvasBlurSupport = false;
    }
    return canvasBlurSupport;
}

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
    // Three reusable scratch canvases for the blur ping-pong (see blurredCover).
    // Reused across frames so a 30fps preview doesn't allocate per frame.
    const blurScratchRef = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
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

        /**
         * Blurred cover-fit backdrop for the contain bars.
         *
         * The original did one extreme downscale (to ~66px tall at the default
         * intensity) and one ~30x upscale, because `ctx.filter` is a no-op on
         * older iOS Safari. It worked everywhere but looked PIXELATED: rebuilding
         * a 1920px frame from 66 samples is blocks, not blur, and iOS resamples
         * harder than Chrome so it shows up worst on a phone.
         *
         * Two paths now, picked by an actual runtime test rather than an
         * assumption about the browser:
         *   • ctx.filter works → a true Gaussian at quarter resolution, which is
         *     what the exporter does (gblur), so preview matches output.
         *   • it doesn't → progressive halving/doubling. Each halving averages
         *     4 pixels into 1 (a real box-blur pass) and each doubling rebuilds
         *     from twice as many samples, so there is never a big blocky jump.
         */
        const scratch = (i: number, w: number, h: number) => {
            const refs = blurScratchRef.current;
            const c = refs[i] ?? (refs[i] = document.createElement('canvas'));
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            return c;
        };

        const blurredCover = (
            src: CanvasImageSource, srcAspect: number, intensityRaw: number,
        ): HTMLCanvasElement | null => {
            const intensity = Math.max(0, Math.min(160, intensityRaw));

            // Quarter resolution: enough detail to upscale cleanly, cheap to blur.
            const qw = Math.max(2, Math.round(cw / 4));
            const qh = Math.max(2, Math.round(ch / 4));
            const base = scratch(0, qw, qh);
            const bctx = base.getContext('2d');
            if (!bctx) return null;
            bctx.imageSmoothingEnabled = true;
            bctx.clearRect(0, 0, qw, qh);
            let bw: number, bh: number;
            if (srcAspect > qw / qh) { bh = qh; bw = qh * srcAspect; } else { bw = qw; bh = qw / srcAspect; }
            bctx.drawImage(src, (qw - bw) / 2, (qh - bh) / 2, bw, bh);

            if (canvasBlurWorks()) {
                // Match the exporter's sigma, scaled to this resolution.
                const sigma = Math.max(1, (intensity / 4) * 0.6);
                const out = scratch(1, qw, qh);
                const octx = out.getContext('2d');
                if (octx) {
                    octx.filter = `blur(${sigma.toFixed(2)}px)`;
                    octx.clearRect(0, 0, qw, qh);
                    octx.drawImage(base, 0, 0);
                    octx.filter = 'none';
                    return out;
                }
            }

            // Fallback: progressive halving, then doubling back up.
            const passes = Math.max(1, Math.min(5, Math.round(intensity / 30) + 1));
            let cur = base;
            let w = qw, h = qh, slot = 1;
            for (let i = 0; i < passes; i++) {
                const nw = Math.max(2, Math.round(w / 2));
                const nh = Math.max(2, Math.round(h / 2));
                const next = scratch(slot, nw, nh);
                const nctx = next.getContext('2d');
                if (!nctx) break;
                nctx.imageSmoothingEnabled = true;
                nctx.clearRect(0, 0, nw, nh);
                nctx.drawImage(cur, 0, 0, nw, nh);
                cur = next; w = nw; h = nh; slot = slot === 1 ? 2 : 1;
            }
            while (w * 2 <= qw || h * 2 <= qh) {
                const nw = Math.min(qw, w * 2);
                const nh = Math.min(qh, h * 2);
                const next = scratch(slot, nw, nh);
                const nctx = next.getContext('2d');
                if (!nctx) break;
                nctx.imageSmoothingEnabled = true;
                nctx.clearRect(0, 0, nw, nh);
                nctx.drawImage(cur, 0, 0, nw, nh);
                cur = next; w = nw; h = nh; slot = slot === 1 ? 2 : 1;
            }
            return cur;
        };

        const drawTransformed = (
            src: CanvasImageSource, sw: number, sh: number, tr: Transform | undefined, alphaMul = 1,
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
                    const blurred = blurredCover(src, srcAspect, transform.blurIntensity ?? 60);
                    if (blurred) {
                        ctx.imageSmoothingEnabled = true;
                        ctx.drawImage(blurred, 0, 0, cw, ch);
                    } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); }
                } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); }
            }

            ctx.save();
            ctx.globalAlpha = (transform.opacity ?? 1) * alphaMul;
            ctx.translate(cx, cy);
            if (transform.rotationDeg) ctx.rotate((transform.rotationDeg * Math.PI) / 180);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        };

        // Fade in/out multiplier for a clip at time t (0..1). Applied to the
        // draw alpha so fades are visible in the preview, not only after export.
        const fadeAlpha = (clip: Clip, t: number): number => {
            const localT = t - clip.timelineStart;
            let a = 1;
            if (clip.fadeIn && clip.fadeIn > 0 && localT < clip.fadeIn) a *= Math.max(0, localT / clip.fadeIn);
            if (clip.fadeOut && clip.fadeOut > 0) {
                const fromEnd = clip.duration - localT;
                if (fromEnd < clip.fadeOut) a *= Math.max(0, fromEnd / clip.fadeOut);
            }
            return a;
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

        const drawText = (clip: Clip, t: number) => {
            const ts = clip.text;
            if (!ts) return;
            const x = (clip.transform?.xPct ?? 0.5) * cw;
            const y = (clip.transform?.yPct ?? 0.5) * ch;
            // Caption clips carry word timings and wrap; plain text clips stay
            // single-line exactly as before.
            paintText(ctx, ts, x, y, ch, ts.words?.length
                ? { localT: t - clip.timelineStart, maxWidth: cw * 0.86 }
                : undefined);
        };

        // Remembered so the CSS filter is only written when it actually changes.
        // Sentinel (not '') so the first frame always writes — otherwise a stale
        // grade from a previous project could linger when the new one has none.
        let lastGrade = ' ';
        const renderFrame = (t: number) => {
            const p = useProjectStore.getState().project;
            if (!p) return;
            ctx.fillStyle = p.meta.backgroundColor || '#000';
            ctx.fillRect(0, 0, cw, ch);
            const acts = activeClipsAt(p, t);

            // Colour grade (brightness/contrast/saturation/grayscale/soften) is
            // applied as a CSS filter on the <canvas> ELEMENT, not via ctx.filter
            // — iOS Safari's canvas filter is a no-op, but CSS element filters
            // work everywhere. The frontmost visual clip's grade wins: single-clip
            // edits (the common case) are exact; a multi-clip project with
            // different grades is approximate in preview, but export still bakes
            // each clip's grade precisely.
            let grade = 'none';
            for (let i = acts.length - 1; i >= 0; i--) {
                const a = acts[i];
                if (a.track.kind === 'video' || a.track.kind === 'image') { grade = effectFilter(a.clip.effects); break; }
            }
            const gradeCss = grade === 'none' ? '' : grade;
            if (gradeCss !== lastGrade) { canvas.style.filter = gradeCss; lastGrade = gradeCss; }

            for (const { clip, track } of acts) {
                if (track.kind === 'audio') continue;
                const fa = fadeAlpha(clip, t);
                if (track.kind === 'text') {
                    if (fa >= 1) { drawText(clip, t); }
                    else { ctx.save(); ctx.globalAlpha = fa; drawText(clip, t); ctx.restore(); }
                    continue;
                }
                if (clip.mediaId && track.kind === 'video') {
                    const v = videoPool.current.get(clip.mediaId);
                    if (v && v.readyState >= 2) drawTransformed(v, v.videoWidth, v.videoHeight, clip.transform, fa);
                } else if (clip.mediaId && track.kind === 'image') {
                    const img = imagePool.current.get(clip.mediaId);
                    if (img && img.complete) drawTransformed(img, img.naturalWidth, img.naturalHeight, clip.transform, fa);
                }
            }
            if (p.meta.watermark) drawWatermark();
        };

        // The frontmost ready video clip active at time t — its <video> element
        // is the playback MASTER: while playing we read the timeline clock from
        // its currentTime (see tick) instead of seeking it to a wall-clock
        // target every frame. Continuous native playback = smooth audio.
        const pickMaster = (p: VideoProject, t: number): { v: HTMLVideoElement; clip: Clip } | null => {
            const act = activeClipsAt(p, t).filter((x) => x.track.kind === 'video' && x.clip.mediaId);
            for (let i = act.length - 1; i >= 0; i--) {           // last painted = frontmost
                const v = videoPool.current.get(act[i].clip.mediaId!);
                if (v && v.readyState >= 2) return { v, clip: act[i].clip };
            }
            return null;
        };

        const syncVideos = (t: number, playing: boolean, masterId: string | null) => {
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
                    // The master drives the clock, so NEVER seek it for routine
                    // drift — a seek mid-play stutters video and cuts audio. Only
                    // correct a big gap (playhead jumped / clip just became
                    // active); otherwise let it free-run. Non-master videos get a
                    // looser follow so parallel clips stay roughly aligned.
                    const isMaster = clip.mediaId === masterId;
                    const tol = isMaster ? 0.75 : 0.34;
                    if (Math.abs(v.currentTime - local) > tol) v.currentTime = local;
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
            let masterId: string | null = null;
            if (pb.isPlaying) {
                const p = useProjectStore.getState().project;
                const master = p ? pickMaster(p, t) : null;
                // Prefer the master video's OWN clock so audio + video play
                // continuously (no per-frame seeking). Fall back to wall-clock
                // when there's no playing master (images/text only, or a clip
                // that just became active and hasn't caught up — guarded by the
                // proximity check so the playhead can't jump at a boundary).
                if (master && !master.v.paused && master.v.readyState >= 2) {
                    masterId = master.clip.mediaId ?? null;
                    const vt = master.clip.timelineStart + (master.v.currentTime - master.clip.srcStart) / (master.clip.speed || 1);
                    t = Math.abs(vt - (t + dt)) < 0.5 ? vt : t + dt;
                } else {
                    t += dt;
                }
                const dur = useProjectStore.getState().project?.durationSec ?? 0;
                if (t >= dur) { t = dur; usePlaybackStore.getState().pause(); }
                usePlaybackStore.getState().setCurrentTime(t);
            }
            // Never let one bad frame kill the loop — a thrown error here would
            // silently freeze the whole preview (and make scrubbing look broken).
            try { syncVideos(t, pb.isPlaying, masterId); renderFrame(t); } catch { /* skip this frame */ }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(rafRef.current);
            canvas.style.filter = ''; // don't leave a grade on the element between projects
        };
    }, [project, cw, ch]);

    // Teardown media elements on unmount.
    useEffect(() => () => {
        for (const v of videoPool.current.values()) { v.pause(); v.removeAttribute('src'); v.load(); }
        videoPool.current.clear();
        imagePool.current.clear();
    }, []);

    return (
        <div className="st-stage" style={{ aspectRatio: `${cw} / ${ch}` }}>
            {/* Decode pool: full-size, BEHIND the opaque canvas (see studio.css).
                On-screen (not zero-size/opacity:0) so iOS Safari keeps decoding
                audio+video past ~1s; the canvas paints over it every frame. */}
            <div ref={poolRef} aria-hidden className="st-pool" />
            <canvas ref={canvasRef} width={cw} height={ch} />
        </div>
    );
}
