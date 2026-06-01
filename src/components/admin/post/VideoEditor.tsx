'use client';

/**
 * VideoEditor
 *
 * Operator UI for trimming + watermarking + (optionally) reformatting an
 * imported video to 9:16 with a fill background and burned-in text overlays,
 * before approval. Renders inside /admin/post/[id] for video imports.
 *
 * The video element ALWAYS loads from the immutable original (initialVideoUrl).
 * After Apply, the server cuts a fresh file from that original and updates
 * social_ids.staged_video_url, but the editor keeps showing the original so
 * the operator can re-edit freely.
 *
 * Layout (top → bottom): video preview → Trim (collapsible) → watermark →
 * Background Fill → Text on video → Apply.
 *
 * Text overlays are positioned in NORMALISED coordinates (xPct/yPct = the
 * text centre as a fraction of the 9:16 canvas) so the same numbers drive the
 * draggable preview AND the server-side FFmpeg burn-in. Adding text forces the
 * export onto the 9:16 canvas (black fill if Background Fill is off) so the
 * text always has somewhere to live — usually the bars above/below the clip.
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

type FillStyle = 'black' | 'white' | 'blur';

interface TextOverlay {
    id: string;
    text: string;
    xPct: number; // 0–1, centre X on the 9:16 canvas
    yPct: number; // 0–1, centre Y on the 9:16 canvas
    color: string; // hex
    sizePct: number; // font size as a fraction of canvas height
}

interface VideoSettings {
    trimStart: number;
    trimEnd: number;
    watermark: boolean;
    backgroundFill: boolean;
    fillStyle: FillStyle;
    blurIntensity: number;
    textOverlays: TextOverlay[];
}

interface VideoEditorProps {
    postId: string;
    /** Immutable original video URL — editor always loads from here. */
    initialVideoUrl: string;
    /** Current rendered output (staged_video_url) — what actually publishes. */
    initialStagedUrl?: string | null;
    initialSettings?: Partial<VideoSettings>;
    onProcessed?: (newUrl: string, durationSeconds: number) => void;
    /**
     * Fires whenever the editor settings change. The parent stashes the latest
     * snapshot so its top-bar "Save" can persist the in-progress draft (text,
     * trim, fill) — otherwise hitting Save would silently drop unrendered text.
     */
    onSettingsChange?: (settings: VideoSettings) => void;
}

// How close (as a fraction of the canvas) a dragged overlay must get to a
// centre line before it magnet-snaps onto it.
const SNAP_THRESHOLD = 0.025;

const THUMB_COUNT = 8;
const HANDLE_WIDTH_PX = 14;
const TIMELINE_HEIGHT_PX = 72;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
function newId(): string {
    try { return crypto.randomUUID(); } catch { return `t-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
}

// Stable signature of the render-affecting settings, so we can tell whether
// the staged output reflects the current edits (vs needing another Apply).
function settingsSignature(s: {
    trimStart?: number; trimEnd?: number; watermark?: boolean;
    backgroundFill?: boolean; fillStyle?: string; blurIntensity?: number;
    textOverlays?: Array<{ text: string; xPct: number; yPct: number; color: string; sizePct: number }>;
} | null | undefined): string {
    if (!s) return '∅';
    const r2 = (n: number | undefined) => Math.round((n ?? 0) * 100) / 100;
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const overlays = (s.textOverlays || [])
        .map((o) => ({ text: (o.text || '').trim(), x: r3(o.xPct), y: r3(o.yPct), c: o.color, sz: r3(o.sizePct) }))
        .filter((o) => o.text.length > 0);
    return JSON.stringify({
        a: r2(s.trimStart), b: r2(s.trimEnd), w: !!s.watermark,
        f: !!s.backgroundFill, fs: s.fillStyle || 'white', bi: s.blurIntensity ?? 20, o: overlays,
    });
}

export default function VideoEditor({
    postId,
    initialVideoUrl,
    initialStagedUrl,
    initialSettings,
    onProcessed,
    onSettingsChange,
}: VideoEditorProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const bgVideoRef = useRef<HTMLVideoElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);

    const videoUrl = initialVideoUrl;
    const [duration, setDuration] = useState<number | null>(null);
    const [trimStart, setTrimStart] = useState(initialSettings?.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(initialSettings?.trimEnd ?? 0);
    const [watermark, setWatermark] = useState(!!initialSettings?.watermark);
    // Background Fill — defaults OFF (independent of other toggles).
    const [backgroundFill, setBackgroundFill] = useState(!!initialSettings?.backgroundFill);
    const [fillStyle, setFillStyle] = useState<FillStyle>(initialSettings?.fillStyle ?? 'white');
    const [blurIntensity, setBlurIntensity] = useState(
        typeof initialSettings?.blurIntensity === 'number' ? initialSettings.blurIntensity : 20,
    );
    // Text overlays burned into the export.
    const [overlays, setOverlays] = useState<TextOverlay[]>(
        Array.isArray(initialSettings?.textOverlays) ? initialSettings!.textOverlays! : [],
    );
    const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
    const [draggingOverlay, setDraggingOverlay] = useState<string | null>(null);
    // Which centre guide lines are currently active (shown while a snapped
    // overlay is being dragged).
    const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
    // Rendered-output preview: the staged file is the literal thing that
    // publishes. We track it + the signature of the settings it was rendered
    // with, so we can flag when the live edits aren't baked in yet.
    const [stagedUrl, setStagedUrl] = useState<string | null>(initialStagedUrl || null);
    const [renderedSig, setRenderedSig] = useState<string>(
        settingsSignature((initialSettings as any)?.lastApplied || null),
    );
    const [outputOpen, setOutputOpen] = useState(false);
    // Trim is collapsed by default — it's the secondary control now.
    const [trimOpen, setTrimOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [thumbs, setThumbs] = useState<string[]>([]);
    const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
    const [frameH, setFrameH] = useState(0);

    // The 9:16 canvas appears when Background Fill is on OR when there are text
    // overlays (text needs the canvas to sit on — black fill when fill is off).
    const showCanvas = backgroundFill || overlays.length > 0;
    const effFillStyle: FillStyle = backgroundFill ? fillStyle : 'black';
    const showBlurPreview = backgroundFill && fillStyle === 'blur';

    // Does the rendered output reflect the current edits? If not, the staged
    // file (what publishes) is stale and needs another Apply.
    const currentSig = settingsSignature({ trimStart, trimEnd, watermark, backgroundFill, fillStyle, blurIntensity, textOverlays: overlays });
    const outputDirty = currentSig !== renderedSig;

    const initialClampDone = useRef(false);
    function handleLoadedMetadata() {
        const v = videoRef.current;
        if (!v || !isFinite(v.duration)) return;
        const trueDuration = v.duration;
        setDuration(trueDuration);
        if (!initialClampDone.current) {
            initialClampDone.current = true;
            const persistedEnd = initialSettings?.trimEnd ?? 0;
            const persistedStart = initialSettings?.trimStart ?? 0;
            const clampedEnd =
                !persistedEnd || persistedEnd === 0
                    ? trueDuration
                    : Math.min(persistedEnd, trueDuration);
            const clampedStart = Math.max(0, Math.min(persistedStart, clampedEnd - 0.5));
            setTrimStart(clampedStart);
            setTrimEnd(clampedEnd);
            v.currentTime = clampedStart;
        }
    }

    // Measure the preview frame's pixel height so overlay font sizes (a
    // fraction of canvas height) map 1:1 between preview and export.
    useLayoutEffect(() => {
        const el = frameRef.current;
        if (!el) { setFrameH(0); return; }
        const measure = () => setFrameH(el.getBoundingClientRect().height);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [showCanvas]);

    const trimStartRef = useRef(trimStart);
    const trimEndRef = useRef(trimEnd);
    const draggingHandleRef = useRef<'start' | 'end' | null>(draggingHandle);
    useEffect(() => { trimStartRef.current = trimStart; }, [trimStart]);
    useEffect(() => { trimEndRef.current = trimEnd; }, [trimEnd]);
    useEffect(() => { draggingHandleRef.current = draggingHandle; }, [draggingHandle]);

    // rAF clamp loop — keeps playback inside the trimmed region.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        let rafId = 0;
        const tick = () => {
            if (draggingHandleRef.current) { rafId = requestAnimationFrame(tick); return; }
            const start = trimStartRef.current;
            const end = trimEndRef.current;
            if (end > start) {
                if (v.currentTime >= end - 0.02) v.currentTime = start;
                else if (v.currentTime < start - 0.02) v.currentTime = start;
            }
            rafId = requestAnimationFrame(tick);
        };
        const onPlay = () => {
            const start = trimStartRef.current;
            const end = trimEndRef.current;
            if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(tick);
        };
        const onPause = () => { cancelAnimationFrame(rafId); rafId = 0; };
        const onSeeking = () => {
            if (draggingHandleRef.current) return;
            const start = trimStartRef.current;
            const end = trimEndRef.current;
            if (v.currentTime < start - 0.02) v.currentTime = start;
            else if (v.currentTime >= end - 0.02) v.currentTime = start;
        };
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);
        v.addEventListener('ended', onPause);
        v.addEventListener('seeking', onSeeking);
        return () => {
            cancelAnimationFrame(rafId);
            v.removeEventListener('play', onPlay);
            v.removeEventListener('pause', onPause);
            v.removeEventListener('ended', onPause);
            v.removeEventListener('seeking', onSeeking);
        };
    }, []);

    // Thumbnail filmstrip extraction.
    useEffect(() => {
        if (!duration || duration <= 0) return;
        let cancelled = false;
        const probe = document.createElement('video');
        probe.crossOrigin = 'anonymous';
        probe.muted = true;
        probe.playsInline = true;
        probe.preload = 'auto';
        probe.src = videoUrl;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const extract = async () => {
            try {
                await new Promise<void>((resolve, reject) => {
                    probe.addEventListener('loadedmetadata', () => resolve(), { once: true });
                    probe.addEventListener('error', () => reject(new Error('probe failed to load')), { once: true });
                });
                const out: string[] = [];
                for (let i = 0; i < THUMB_COUNT; i++) {
                    if (cancelled) return;
                    const t = (duration * (i + 0.5)) / THUMB_COUNT;
                    probe.currentTime = Math.min(t, duration - 0.05);
                    await new Promise<void>((resolve) => {
                        probe.addEventListener('seeked', () => resolve(), { once: true });
                    });
                    ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
                    out.push(canvas.toDataURL('image/jpeg', 0.6));
                }
                if (!cancelled) setThumbs(out);
            } catch (e) {
                console.warn('[VideoEditor] thumbnail extraction failed:', e);
            }
        };
        extract();
        return () => { cancelled = true; probe.src = ''; };
    }, [videoUrl, duration]);

    // Keep the blurred backdrop <video> in lockstep with the main clip.
    useEffect(() => {
        if (!showBlurPreview) return;
        const main = videoRef.current;
        const bg = bgVideoRef.current;
        if (!main || !bg) return;
        const resync = () => {
            if (Math.abs(bg.currentTime - main.currentTime) > 0.18) bg.currentTime = main.currentTime;
        };
        const onPlay = () => { resync(); bg.play().catch(() => {}); };
        const onPause = () => { bg.pause(); };
        const onSeeking = () => { bg.currentTime = main.currentTime; };
        bg.currentTime = main.currentTime;
        if (!main.paused) bg.play().catch(() => {});
        main.addEventListener('play', onPlay);
        main.addEventListener('pause', onPause);
        main.addEventListener('seeking', onSeeking);
        main.addEventListener('timeupdate', resync);
        return () => {
            main.removeEventListener('play', onPlay);
            main.removeEventListener('pause', onPause);
            main.removeEventListener('seeking', onSeeking);
            main.removeEventListener('timeupdate', resync);
        };
    }, [showBlurPreview, videoUrl]);

    // Drag a text overlay around the canvas (pointer events → mouse + touch).
    // Magnet-snaps to the centre lines: the vertical centreline (x = 0.5) keeps
    // text horizontally centred — the common case — and the horizontal
    // centreline (y = 0.5) too. A guide line shows while snapped.
    useEffect(() => {
        if (!draggingOverlay) return;
        const move = (e: PointerEvent) => {
            const frame = frameRef.current;
            if (!frame) return;
            const r = frame.getBoundingClientRect();
            let x = clamp((e.clientX - r.left) / r.width, 0.02, 0.98);
            let y = clamp((e.clientY - r.top) / r.height, 0.02, 0.98);
            const snapX = Math.abs(x - 0.5) < SNAP_THRESHOLD;
            const snapY = Math.abs(y - 0.5) < SNAP_THRESHOLD;
            if (snapX) x = 0.5;
            if (snapY) y = 0.5;
            setSnapGuides((prev) => (prev.x === snapX && prev.y === snapY ? prev : { x: snapX, y: snapY }));
            setOverlays((prev) => prev.map((o) => (o.id === draggingOverlay ? { ...o, xPct: x, yPct: y } : o)));
        };
        const up = () => { setDraggingOverlay(null); setSnapGuides({ x: false, y: false }); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
    }, [draggingOverlay]);

    // Surface the current settings to the parent so its top-bar Save can
    // persist the in-progress draft. Fires on every settings change; the
    // parent stashes it in a ref (no re-render, no loop).
    useEffect(() => {
        onSettingsChange?.({ trimStart, trimEnd, watermark, backgroundFill, fillStyle, blurIntensity, textOverlays: overlays });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimStart, trimEnd, watermark, backgroundFill, fillStyle, blurIntensity, overlays]);

    // ── Trim handle drag ──────────────────────────────────────
    const beginDrag = useCallback(
        (handle: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
            if (busy || !duration) return;
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            setDraggingHandle(handle);
        },
        [busy, duration],
    );
    const handleMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!draggingHandle || !duration || !timelineRef.current) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const t = (x / rect.width) * duration;
            const MIN_GAP = 0.5;
            if (draggingHandle === 'start') {
                const next = Math.min(t, trimEnd - MIN_GAP);
                setTrimStart(Math.max(0, next));
                const v = videoRef.current;
                if (v) v.currentTime = Math.max(0, next);
            } else {
                const next = Math.max(t, trimStart + MIN_GAP);
                setTrimEnd(Math.min(duration, next));
                const v = videoRef.current;
                if (v) v.currentTime = Math.min(duration - 0.05, next);
            }
        },
        [draggingHandle, duration, trimStart, trimEnd],
    );
    const endDrag = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (draggingHandle) {
                try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
            }
            setDraggingHandle(null);
        },
        [draggingHandle],
    );

    // ── Text overlay helpers ──────────────────────────────────
    function addOverlay() {
        const o: TextOverlay = {
            id: newId(),
            text: 'New text',
            xPct: 0.5,
            yPct: overlays.length % 2 === 0 ? 0.09 : 0.91, // alternate top / bottom bar
            color: '#ffffff',
            sizePct: 0.045,
        };
        setOverlays((prev) => [...prev, o]);
        setSelectedOverlayId(o.id);
    }
    function updateOverlay(id: string, patch: Partial<TextOverlay>) {
        setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    }
    function removeOverlay(id: string) {
        setOverlays((prev) => prev.filter((o) => o.id !== id));
        setSelectedOverlayId((cur) => (cur === id ? null : cur));
    }
    const beginOverlayDrag = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (busy) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedOverlayId(id);
        setDraggingOverlay(id);
    };

    // Clean blank blocks, trim text — used by both draft-save and Apply.
    function cleanedOverlays() {
        return overlays.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text.length > 0);
    }

    async function handleApply() {
        if (duration === null) {
            setError('Video metadata still loading — give it a second and try again.');
            return;
        }
        if (trimEnd <= trimStart) { setError('End must be greater than start.'); return; }
        if (trimEnd - trimStart < 1) { setError('Trimmed clip must be at least 1 second long.'); return; }
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            // Drop blank text blocks so they don't burn empty overlays.
            const cleanOverlays = cleanedOverlays();
            const res = await fetch('/api/admin/video-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    postId,
                    trimStart,
                    trimEnd,
                    watermark,
                    backgroundFill,
                    fillStyle,
                    blurIntensity,
                    textOverlays: cleanOverlays,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Process failed (HTTP ${res.status})`);
            }
            // The staged file now reflects exactly these settings — record it
            // as the rendered output so "Preview output" shows the real thing
            // and the dirty flag clears.
            setStagedUrl(json.staged_video_url);
            setRenderedSig(currentSig);
            const newDuration = trimEnd - trimStart;
            const fillNote = backgroundFill
                ? `, 9:16 ${fillStyle === 'blur' ? `blur (${blurIntensity})` : fillStyle} fill`
                : (cleanOverlays.length ? ', 9:16 canvas' : '');
            const textNote = cleanOverlays.length ? `, ${cleanOverlays.length} text overlay${cleanOverlays.length > 1 ? 's' : ''}` : '';
            setInfo(`Saved a ${newDuration.toFixed(1)}s clip${watermark ? ' with watermark' : ''}${fillNote}${textNote} (${(json.bytes / 1024 / 1024).toFixed(1)} MB). Adjust and Apply again to re-cut from the original.`);
            onProcessed?.(json.staged_video_url, newDuration);
        } catch (e: any) {
            setError(e?.message || 'Process failed');
        } finally {
            setBusy(false);
        }
    }

    function fmtTime(s: number): string {
        if (!isFinite(s)) return '—';
        const m = Math.floor(s / 60);
        const sec = s - m * 60;
        return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
    }

    const dur = duration ?? 0;
    const trimmedLen = Math.max(0, trimEnd - trimStart);
    const startPct = dur > 0 ? (trimStart / dur) * 100 : 0;
    const endPct = dur > 0 ? (trimEnd / dur) * 100 : 100;

    const HANDLE_COLOR = '#9D7BFF';
    const HANDLE_BORDER = 'rgba(157, 123, 255, 0.95)';

    const cardStyle = {
        background: 'rgba(12, 12, 24, 0.55)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
    } as const;

    return (
        <div className="space-y-3">
            {/* ── Video preview ─────────────────────────────────── */}
            <div
                className="rounded-2xl overflow-hidden relative"
                style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.06)' }}
            >
                <div
                    ref={frameRef}
                    style={
                        showCanvas
                            ? {
                                  aspectRatio: '9 / 16',
                                  maxHeight: 600,
                                  margin: '0 auto',
                                  position: 'relative',
                                  overflow: 'hidden',
                                  background:
                                      effFillStyle === 'white'
                                          ? '#ffffff'
                                          : effFillStyle === 'black'
                                            ? '#000000'
                                            : '#0a0a14',
                              }
                            : { position: 'relative' }
                    }
                >
                    {showBlurPreview && (
                        <video
                            key="bg"
                            ref={bgVideoRef}
                            src={videoUrl}
                            muted
                            playsInline
                            aria-hidden
                            crossOrigin="anonymous"
                            style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                filter: `blur(${blurIntensity}px)`,
                                transform: 'scale(1.08)',
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <video
                        key="main"
                        ref={videoRef}
                        src={videoUrl}
                        onLoadedMetadata={handleLoadedMetadata}
                        crossOrigin="anonymous"
                        controls
                        // Native fullscreen shows ONLY the raw video element —
                        // the text/fill overlays are DOM siblings and vanish.
                        // Disable it; "Preview output" plays the real rendered
                        // file instead.
                        controlsList="nofullscreen"
                        disablePictureInPicture
                        playsInline
                        // In canvas mode the video must be transparent, NOT
                        // bg-black: object-fit:contain makes the element box the
                        // whole 9:16 frame, so an opaque background would paint
                        // over the fill behind it.
                        className={showCanvas ? '' : 'w-full max-h-[600px] bg-black'}
                        style={
                            showCanvas
                                ? {
                                      position: 'relative',
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'contain',
                                      zIndex: 1,
                                      background: 'transparent',
                                  }
                                : undefined
                        }
                    />

                    {/* Draggable text overlays — only in canvas mode */}
                    {showCanvas && frameH > 0 && overlays.map((o) => (
                        <div
                            key={o.id}
                            onPointerDown={beginOverlayDrag(o.id)}
                            style={{
                                position: 'absolute',
                                left: `${o.xPct * 100}%`,
                                top: `${o.yPct * 100}%`,
                                transform: 'translate(-50%, -50%)',
                                fontSize: `${o.sizePct * frameH}px`,
                                lineHeight: 1.05,
                                color: o.color,
                                fontFamily: 'var(--font-display)',
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                                cursor: 'move',
                                userSelect: 'none',
                                touchAction: 'none',
                                textShadow: '0 2px 6px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.9)',
                                padding: '2px 6px',
                                zIndex: 4,
                                outline: selectedOverlayId === o.id ? '1px dashed rgba(157,123,255,0.95)' : 'none',
                                outlineOffset: 2,
                            }}
                        >
                            {o.text || ' '}
                        </div>
                    ))}

                    {/* Centre snap guides — shown while a snapped overlay drags */}
                    {showCanvas && draggingOverlay && snapGuides.x && (
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, transform: 'translateX(-0.5px)', background: 'rgba(157,123,255,0.95)', boxShadow: '0 0 4px rgba(157,123,255,0.8)', zIndex: 5, pointerEvents: 'none' }} />
                    )}
                    {showCanvas && draggingOverlay && snapGuides.y && (
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, transform: 'translateY(-0.5px)', background: 'rgba(157,123,255,0.95)', boxShadow: '0 0 4px rgba(157,123,255,0.8)', zIndex: 5, pointerEvents: 'none' }} />
                    )}
                </div>
                {busy && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
                    >
                        <span className="text-[10px] uppercase tracking-[0.3em] font-mono" style={{ color: '#7adfff' }}>
                            Processing video…
                        </span>
                    </div>
                )}
            </div>

            {/* ── Preview output — the REAL rendered file that publishes ──
                The preview above is a live mock-up (text/fill layered over the
                raw clip). This plays the actual staged render so the operator
                can confirm exactly what goes out. */}
            <button
                type="button"
                onClick={() => setOutputOpen(true)}
                disabled={!stagedUrl}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-left transition-all hover:bg-white/[0.04] disabled:opacity-50"
                style={cardStyle}
            >
                <span className="text-sm">⛶</span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                        Preview output
                    </span>
                    <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {!stagedUrl
                            ? 'No render yet — hit Apply changes first'
                            : outputDirty
                                ? 'Shows the last render — your latest edits aren’t baked in yet'
                                : 'Plays the exact file that will publish'}
                    </span>
                </span>
                {stagedUrl && (
                    <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0"
                        style={
                            outputDirty
                                ? { background: 'rgba(255,170,0,0.12)', border: '1px solid rgba(255,170,0,0.35)', color: '#ffcc66' }
                                : { background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)', color: '#7af0a8' }
                        }
                    >
                        {outputDirty ? '⚠ Needs Apply' : '✓ Up to date'}
                    </span>
                )}
            </button>

            {/* ── Controls ──────────────────────────────────────── */}
            <div className="rounded-2xl p-5 space-y-4" style={cardStyle}>
                {/* Trim — collapsible (collapsed by default) */}
                <div>
                    <button
                        type="button"
                        onClick={() => setTrimOpen((o) => !o)}
                        className="w-full flex items-center justify-between gap-2"
                    >
                        <span className="flex items-center gap-2">
                            <span
                                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                            >
                                Trim
                            </span>
                            {duration !== null && (
                                <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                    {trimmedLen.toFixed(1)}s of {dur.toFixed(1)}s
                                </span>
                            )}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)', transform: trimOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            ▼
                        </span>
                    </button>

                    {trimOpen && (
                        <div className="space-y-4 pt-4">
                            <div className="flex items-baseline justify-end">
                                {duration !== null && (
                                    <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                        <span style={{ color: HANDLE_COLOR }}>{fmtTime(trimStart)}</span>
                                        {' → '}
                                        <span style={{ color: HANDLE_COLOR }}>{fmtTime(trimEnd)}</span>
                                    </span>
                                )}
                            </div>
                            <div
                                ref={timelineRef}
                                className="relative w-full select-none"
                                style={{
                                    height: `${TIMELINE_HEIGHT_PX}px`,
                                    background: '#0a0a14',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    touchAction: 'none',
                                }}
                                onPointerMove={handleMove}
                                onPointerUp={endDrag}
                                onPointerCancel={endDrag}
                            >
                                <div className="absolute inset-0 flex">
                                    {thumbs.length > 0
                                        ? thumbs.map((src, i) => (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img key={i} src={src} alt="" draggable={false} className="h-full flex-1 object-cover pointer-events-none" style={{ minWidth: 0 }} />
                                          ))
                                        : (
                                            <div className="h-full w-full" style={{ background: 'linear-gradient(90deg, rgba(123,97,255,0.10), rgba(0,212,255,0.10))' }} />
                                        )}
                                </div>
                                <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: 0, width: `${startPct}%`, background: 'rgba(0,0,0,0.65)' }} />
                                <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${endPct}%`, right: 0, background: 'rgba(0,0,0,0.65)' }} />
                                <div className="absolute pointer-events-none" style={{ left: `${startPct}%`, width: `${endPct - startPct}%`, top: 0, bottom: 0, borderTop: `3px solid ${HANDLE_BORDER}`, borderBottom: `3px solid ${HANDLE_BORDER}`, boxSizing: 'border-box' }} />
                                <div
                                    role="slider"
                                    aria-label="Trim start"
                                    aria-valuemin={0}
                                    aria-valuemax={dur}
                                    aria-valuenow={trimStart}
                                    onPointerDown={beginDrag('start')}
                                    className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: `calc(${startPct}% - ${HANDLE_WIDTH_PX / 2}px)`, width: `${HANDLE_WIDTH_PX}px`, cursor: 'ew-resize', background: HANDLE_BORDER, touchAction: 'none', zIndex: 2 }}
                                >
                                    <div className="rounded-sm" style={{ width: '2px', height: '24px', background: 'rgba(255,255,255,0.9)' }} />
                                </div>
                                <div
                                    role="slider"
                                    aria-label="Trim end"
                                    aria-valuemin={0}
                                    aria-valuemax={dur}
                                    aria-valuenow={trimEnd}
                                    onPointerDown={beginDrag('end')}
                                    className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: `calc(${endPct}% - ${HANDLE_WIDTH_PX / 2}px)`, width: `${HANDLE_WIDTH_PX}px`, cursor: 'ew-resize', background: HANDLE_BORDER, touchAction: 'none', zIndex: 2 }}
                                >
                                    <div className="rounded-sm" style={{ width: '2px', height: '24px', background: 'rgba(255,255,255,0.9)' }} />
                                </div>
                            </div>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Drag the purple handles to trim. The video previews where each handle lands.
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="pt-3 space-y-4">
                    {/* Watermark */}
                    <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={watermark} disabled={busy} onChange={(e) => setWatermark(e.target.checked)} />
                        <span className="text-xs">
                            Burn in <span style={{ color: HANDLE_COLOR }}>@KumoLabAnime</span> watermark (bottom-right)
                        </span>
                    </label>

                    {/* Background Fill */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={backgroundFill} disabled={busy} onChange={(e) => setBackgroundFill(e.target.checked)} />
                            <span className="text-xs">
                                Background Fill — fit the full clip to <span style={{ color: HANDLE_COLOR }}>9:16</span>, fill the gaps (no crop)
                            </span>
                        </label>
                        {backgroundFill && (
                            <div className="pl-6 space-y-3">
                                <div className="flex items-center gap-2">
                                    {(['black', 'white', 'blur'] as FillStyle[]).map((s) => {
                                        const active = fillStyle === s;
                                        return (
                                            <button
                                                key={s}
                                                type="button"
                                                disabled={busy}
                                                onClick={() => setFillStyle(s)}
                                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                style={{
                                                    background: active ? 'rgba(123,97,255,0.25)' : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${active ? 'rgba(123,97,255,0.60)' : 'rgba(255,255,255,0.08)'}`,
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    fontFamily: 'var(--font-display)',
                                                }}
                                            >
                                                {s}
                                            </button>
                                        );
                                    })}
                                </div>
                                {fillStyle === 'blur' && (
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Blur</span>
                                        <input type="range" min={2} max={40} step={1} value={blurIntensity} disabled={busy} onChange={(e) => setBlurIntensity(Number(e.target.value))} className="flex-1" style={{ accentColor: HANDLE_COLOR }} />
                                        <span className="text-[10px] font-mono w-6 text-right" style={{ color: HANDLE_COLOR }}>{blurIntensity}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Text on video */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                                Text on video
                            </span>
                            <button
                                type="button"
                                onClick={addOverlay}
                                disabled={busy}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40"
                                style={{ background: 'rgba(123,97,255,0.18)', border: '1px solid rgba(123,97,255,0.45)', color: '#cdbcff', fontFamily: 'var(--font-display)' }}
                            >
                                ＋ Add text
                            </button>
                        </div>

                        {overlays.length === 0 ? (
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Add text and drag it anywhere on the canvas — usually above or below the clip. Emojis work too 🔥 (type them from your keyboard).
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {overlays.map((o) => {
                                    const selected = selectedOverlayId === o.id;
                                    return (
                                        <div
                                            key={o.id}
                                            onClick={() => setSelectedOverlayId(o.id)}
                                            className="flex items-center gap-2 p-2 rounded-lg"
                                            style={{
                                                background: selected ? 'rgba(123,97,255,0.10)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${selected ? 'rgba(123,97,255,0.45)' : 'rgba(255,255,255,0.07)'}`,
                                            }}
                                        >
                                            <input
                                                type="text"
                                                value={o.text}
                                                disabled={busy}
                                                onChange={(e) => updateOverlay(o.id, { text: e.target.value })}
                                                onFocus={() => setSelectedOverlayId(o.id)}
                                                placeholder="Type text + emoji…"
                                                className="flex-1 min-w-0 px-2 py-1.5 rounded-md text-sm outline-none"
                                                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-primary)' }}
                                            />
                                            <input
                                                type="color"
                                                value={o.color}
                                                disabled={busy}
                                                onChange={(e) => updateOverlay(o.id, { color: e.target.value })}
                                                title="Text color"
                                                className="w-8 h-8 rounded cursor-pointer shrink-0 bg-transparent"
                                                style={{ border: '1px solid rgba(255,255,255,0.15)', padding: 0 }}
                                            />
                                            <input
                                                type="range"
                                                min={2}
                                                max={9}
                                                step={0.5}
                                                value={Math.round(o.sizePct * 100 * 10) / 10}
                                                disabled={busy}
                                                onChange={(e) => updateOverlay(o.id, { sizePct: Number(e.target.value) / 100 })}
                                                title="Text size"
                                                className="w-16 shrink-0"
                                                style={{ accentColor: HANDLE_COLOR }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeOverlay(o.id)}
                                                disabled={busy}
                                                title="Delete text"
                                                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs"
                                                style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.30)', color: '#ff8888' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    );
                                })}
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    Drag each text block on the canvas to position it. Burned into the exported 9:16 video.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Apply — renders the edits into the video. Saving (without
                    rendering) lives in the top bar's "Save draft". */}
                <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={busy || duration === null}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.20), rgba(123,97,255,0.15))', border: '1px solid rgba(123,97,255,0.40)', color: '#fff', fontFamily: 'var(--font-display)' }}
                    >
                        {busy ? 'Processing…' : 'Apply changes'}
                    </button>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Renders text / watermark / fill into the video (FFmpeg, ~5–20s). Trim-only is instant. Use <strong style={{ color: 'var(--text-secondary)' }}>Save draft</strong> up top to save without rendering.
                    </span>
                </div>

                {error && (
                    <div className="text-[11px] px-3 py-2 rounded-md" style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.30)', color: '#ff8888' }}>
                        {error}
                    </div>
                )}
                {info && (
                    <div className="text-[11px] px-3 py-2 rounded-md" style={{ background: 'rgba(0,255,136,0.10)', border: '1px solid rgba(0,255,136,0.30)', color: '#7af0a8' }}>
                        {info}
                    </div>
                )}
            </div>

            {/* ── Output modal — the actual rendered file ─────────── */}
            {outputOpen && stagedUrl && (
                <div
                    className="fixed inset-0 z-[300] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
                    onClick={() => setOutputOpen(false)}
                >
                    <div className="w-full max-w-md flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
                                Final output — what publishes
                            </span>
                            <button onClick={() => setOutputOpen(false)} className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                Close
                            </button>
                        </div>
                        {outputDirty && (
                            <div className="text-[11px] px-3 py-2 rounded-md" style={{ background: 'rgba(255,170,0,0.10)', border: '1px solid rgba(255,170,0,0.30)', color: '#ffcc66' }}>
                                ⚠ This is the last render. Your latest edits aren’t baked in yet — close, hit “Apply changes”, then preview again.
                            </div>
                        )}
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video
                            src={stagedUrl}
                            controls
                            autoPlay
                            playsInline
                            className="w-full rounded-xl"
                            style={{ maxHeight: '78vh', background: '#000' }}
                        />
                        <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                            This is the actual file. Fullscreen here shows exactly what your audience sees.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
