'use client';

/**
 * VideoEditor
 *
 * Operator UI for trimming + watermarking an imported video before approval.
 * Renders inside /admin/post/[id] in place of the image preview + overlay
 * editing sections when the post is a video import (social_ids.staged_video_url
 * is set and post.image is null).
 *
 * Trim UX: iPhone / Instagram style — a horizontal filmstrip of thumbnails
 * extracted from the video, with two draggable edge handles. The "kept"
 * region between the handles is bright; everything outside is dimmed.
 * Dragging a handle live-seeks the video so the operator sees the exact
 * frame they're cutting to. No numeric inputs.
 *
 * Title + caption + Save/Approve stay in the parent page (work the same for
 * both image and video posts).
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface VideoSettings {
    trimStart: number;
    trimEnd: number;
    watermark: boolean;
}

interface VideoEditorProps {
    postId: string;
    initialVideoUrl: string;
    initialSettings?: Partial<VideoSettings>;
    onProcessed?: (newUrl: string, durationSeconds: number) => void;
}

const THUMB_COUNT = 8;
const HANDLE_WIDTH_PX = 14;
const TIMELINE_HEIGHT_PX = 72;

export default function VideoEditor({
    postId,
    initialVideoUrl,
    initialSettings,
    onProcessed,
}: VideoEditorProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);

    const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
    const [duration, setDuration] = useState<number | null>(null);
    const [trimStart, setTrimStart] = useState(initialSettings?.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(initialSettings?.trimEnd ?? 0);
    const [watermark, setWatermark] = useState(!!initialSettings?.watermark);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [thumbs, setThumbs] = useState<string[]>([]);
    const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

    // Once the <video> loads metadata we know the true duration.
    // - Always set duration state.
    // - Clamp any persisted trim values to the new duration. Stale settings
    //   are common: image_settings.video.trimEnd was saved against the
    //   PRE-trim source duration, so after a previous "Apply changes" the
    //   stored trimEnd is usually larger than the new clip's runtime.
    //   Without this clamp the right handle renders off the timeline.
    // - If the operator hasn't set an end, default to the full clip.
    const initialEndSetForUrl = useRef<string | null>(null);
    function handleLoadedMetadata() {
        const v = videoRef.current;
        if (!v || !isFinite(v.duration)) return;
        const trueDuration = v.duration;
        setDuration(trueDuration);
        if (initialEndSetForUrl.current !== videoUrl) {
            initialEndSetForUrl.current = videoUrl;
            const persistedEnd = initialSettings?.trimEnd ?? 0;
            const persistedStart = initialSettings?.trimStart ?? 0;
            // Clamp end into [0, duration]. Treat 0/missing as "full clip".
            const clampedEnd =
                !persistedEnd || persistedEnd === 0
                    ? trueDuration
                    : Math.min(persistedEnd, trueDuration);
            // Clamp start into [0, clampedEnd - 0.5s].
            const clampedStart = Math.max(0, Math.min(persistedStart, clampedEnd - 0.5));
            setTrimStart(clampedStart);
            setTrimEnd(clampedEnd);
        }
    }

    // Force video element to re-fetch when we swap to a freshly processed result.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.load();
        // Reset thumbnails — they'll be re-extracted once new metadata loads.
        setThumbs([]);
    }, [videoUrl]);

    // Extract THUMB_COUNT thumbnails from the video using an offscreen
    // <video> + canvas. Runs whenever the video URL or duration changes.
    // If CORS blocks the canvas read (Supabase signed URLs usually serve
    // permissive CORS for public buckets, but be defensive), the catch
    // leaves thumbs empty and the timeline falls back to a flat bar.
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
                // Leave thumbs empty — UI falls back to flat bar
                console.warn('[VideoEditor] thumbnail extraction failed:', e);
            }
        };
        extract();

        return () => {
            cancelled = true;
            probe.src = '';
        };
    }, [videoUrl, duration]);

    // Drag handler — uses pointer events so mouse + touch both work.
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

    async function handleApply() {
        if (duration === null) {
            setError('Video metadata still loading — give it a second and try again.');
            return;
        }
        if (trimEnd <= trimStart) {
            setError('End must be greater than start.');
            return;
        }
        if (trimEnd - trimStart < 1) {
            setError('Trimmed clip must be at least 1 second long.');
            return;
        }
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            const res = await fetch('/api/admin/video-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ postId, trimStart, trimEnd, watermark }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Process failed (HTTP ${res.status})`);
            }
            const fresh = `${json.staged_video_url}?t=${Date.now()}`;
            setVideoUrl(fresh);
            const newDuration = trimEnd - trimStart;
            initialEndSetForUrl.current = fresh;
            setTrimStart(0);
            setTrimEnd(newDuration);
            setDuration(newDuration);
            setInfo(`Trimmed to ${newDuration.toFixed(1)}s (${(json.bytes / 1024 / 1024).toFixed(1)} MB)${watermark ? ' with watermark' : ''}.`);
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

    const HANDLE_COLOR = '#9D7BFF'; // KumoLab purple, mirrors brand
    const HANDLE_BORDER = 'rgba(157, 123, 255, 0.95)';

    return (
        <div className="space-y-3">
            {/* ── Video preview ─────────────────────────────────── */}
            <div
                className="rounded-2xl overflow-hidden relative"
                style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.06)' }}
            >
                <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={handleLoadedMetadata}
                    crossOrigin="anonymous"
                    controls
                    playsInline
                    className="w-full max-h-[600px] bg-black"
                />
                {busy && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
                    >
                        <span
                            className="text-[10px] uppercase tracking-[0.3em] font-mono"
                            style={{ color: '#7adfff' }}
                        >
                            Processing video…
                        </span>
                    </div>
                )}
            </div>

            {/* ── Trim timeline ─────────────────────────────────── */}
            <div
                className="rounded-2xl p-5 space-y-4"
                style={{
                    background: 'rgba(12, 12, 24, 0.55)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <span
                        className="text-[10px] font-bold uppercase tracking-[0.22em]"
                        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                    >
                        Trim
                    </span>
                    {duration !== null && (
                        <span
                            className="text-[11px] font-mono"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            <span style={{ color: HANDLE_COLOR }}>{fmtTime(trimStart)}</span>
                            {' → '}
                            <span style={{ color: HANDLE_COLOR }}>{fmtTime(trimEnd)}</span>
                            {' · '}
                            {trimmedLen.toFixed(1)}s of {dur.toFixed(1)}s
                        </span>
                    )}
                </div>

                {/* The timeline itself */}
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
                    {/* Filmstrip — thumbnails behind everything else */}
                    <div className="absolute inset-0 flex">
                        {thumbs.length > 0
                            ? thumbs.map((src, i) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                      key={i}
                                      src={src}
                                      alt=""
                                      draggable={false}
                                      className="h-full flex-1 object-cover pointer-events-none"
                                      style={{ minWidth: 0 }}
                                  />
                              ))
                            : (
                                <div
                                    className="h-full w-full"
                                    style={{
                                        background:
                                            'linear-gradient(90deg, rgba(123,97,255,0.10), rgba(0,212,255,0.10))',
                                    }}
                                />
                            )}
                    </div>

                    {/* Left dim — covers the trimmed-away pre-roll */}
                    <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                            left: 0,
                            width: `${startPct}%`,
                            background: 'rgba(0,0,0,0.65)',
                        }}
                    />
                    {/* Right dim — covers the trimmed-away tail */}
                    <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                            left: `${endPct}%`,
                            right: 0,
                            background: 'rgba(0,0,0,0.65)',
                        }}
                    />

                    {/* Kept-region outline */}
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            left: `${startPct}%`,
                            width: `${endPct - startPct}%`,
                            top: 0,
                            bottom: 0,
                            borderTop: `3px solid ${HANDLE_BORDER}`,
                            borderBottom: `3px solid ${HANDLE_BORDER}`,
                            boxSizing: 'border-box',
                        }}
                    />

                    {/* Start handle */}
                    <div
                        role="slider"
                        aria-label="Trim start"
                        aria-valuemin={0}
                        aria-valuemax={dur}
                        aria-valuenow={trimStart}
                        onPointerDown={beginDrag('start')}
                        className="absolute top-0 bottom-0 flex items-center justify-center"
                        style={{
                            left: `calc(${startPct}% - ${HANDLE_WIDTH_PX / 2}px)`,
                            width: `${HANDLE_WIDTH_PX}px`,
                            cursor: 'ew-resize',
                            background: HANDLE_BORDER,
                            touchAction: 'none',
                            zIndex: 2,
                        }}
                    >
                        <div
                            className="rounded-sm"
                            style={{
                                width: '2px',
                                height: '24px',
                                background: 'rgba(255,255,255,0.9)',
                            }}
                        />
                    </div>

                    {/* End handle */}
                    <div
                        role="slider"
                        aria-label="Trim end"
                        aria-valuemin={0}
                        aria-valuemax={dur}
                        aria-valuenow={trimEnd}
                        onPointerDown={beginDrag('end')}
                        className="absolute top-0 bottom-0 flex items-center justify-center"
                        style={{
                            left: `calc(${endPct}% - ${HANDLE_WIDTH_PX / 2}px)`,
                            width: `${HANDLE_WIDTH_PX}px`,
                            cursor: 'ew-resize',
                            background: HANDLE_BORDER,
                            touchAction: 'none',
                            zIndex: 2,
                        }}
                    >
                        <div
                            className="rounded-sm"
                            style={{
                                width: '2px',
                                height: '24px',
                                background: 'rgba(255,255,255,0.9)',
                            }}
                        />
                    </div>
                </div>

                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Drag the purple handles to trim. The video previews where each handle lands.
                </p>

                <label
                    className="flex items-center gap-2 cursor-pointer pt-1"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <input
                        type="checkbox"
                        checked={watermark}
                        disabled={busy}
                        onChange={(e) => setWatermark(e.target.checked)}
                    />
                    <span className="text-xs">
                        Burn in <span style={{ color: HANDLE_COLOR }}>@KumoLabAnime</span> watermark (bottom-right)
                    </span>
                </label>

                <div className="flex items-center gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={busy || duration === null}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.20), rgba(123,97,255,0.15))',
                            border: '1px solid rgba(123,97,255,0.40)',
                            color: '#fff',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        {busy ? 'Processing…' : 'Apply changes'}
                    </button>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Runs FFmpeg server-side. Watermark adds ~5–20s. Trim-only is instant.
                    </span>
                </div>

                {error && (
                    <div
                        className="text-[11px] px-3 py-2 rounded-md"
                        style={{
                            background: 'rgba(255,68,68,0.10)',
                            border: '1px solid rgba(255,68,68,0.30)',
                            color: '#ff8888',
                        }}
                    >
                        {error}
                    </div>
                )}

                {info && (
                    <div
                        className="text-[11px] px-3 py-2 rounded-md"
                        style={{
                            background: 'rgba(0,255,136,0.10)',
                            border: '1px solid rgba(0,255,136,0.30)',
                            color: '#7af0a8',
                        }}
                    >
                        {info}
                    </div>
                )}
            </div>
        </div>
    );
}
