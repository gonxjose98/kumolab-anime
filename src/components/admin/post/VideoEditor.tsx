'use client';

/**
 * VideoEditor
 *
 * Operator UI for trimming + watermarking an imported video before approval.
 * Renders inside /admin/post/[id] in place of the image preview + overlay
 * editing sections when the post is a video import (social_ids.staged_video_url
 * is set and post.image is null).
 *
 * Self-contained — owns the video element, trim sliders, watermark toggle,
 * and the "Apply changes" call to /api/admin/video-process. After a
 * successful process, swaps the player source to the new bucket URL so the
 * operator can preview the trimmed result without leaving the page.
 *
 * Title + caption + Save/Approve stay in the parent page (work the same for
 * both image and video posts).
 */

import { useEffect, useRef, useState } from 'react';

interface VideoSettings {
    trimStart: number;
    trimEnd: number;
    watermark: boolean;
}

interface VideoEditorProps {
    postId: string;
    /** Current staged video URL (changes after each successful process). */
    initialVideoUrl: string;
    /** Persisted trim settings from posts.image_settings.video, if any. */
    initialSettings?: Partial<VideoSettings>;
    /** Called when a process succeeds with the new URL, so parent can refresh post state. */
    onProcessed?: (newUrl: string, durationSeconds: number) => void;
}

export default function VideoEditor({
    postId,
    initialVideoUrl,
    initialSettings,
    onProcessed,
}: VideoEditorProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
    const [duration, setDuration] = useState<number | null>(null);
    const [trimStart, setTrimStart] = useState(initialSettings?.trimStart ?? 0);
    const [trimEnd, setTrimEnd] = useState(initialSettings?.trimEnd ?? 0);
    const [watermark, setWatermark] = useState(!!initialSettings?.watermark);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    // Once the <video> element loads metadata, snap the end slider to the
    // video's true duration if the operator hasn't moved it yet. We only
    // do this on the first metadata load per video URL — once the operator
    // has dragged the slider, their position is sticky.
    const initialEndSetForUrl = useRef<string | null>(null);
    function handleLoadedMetadata() {
        const v = videoRef.current;
        if (!v || !isFinite(v.duration)) return;
        setDuration(v.duration);
        if (initialEndSetForUrl.current !== videoUrl) {
            initialEndSetForUrl.current = videoUrl;
            // If no persisted trim, default to full clip.
            if (!initialSettings?.trimEnd || initialSettings.trimEnd === 0) {
                setTrimEnd(v.duration);
            }
        }
    }

    // Whenever videoUrl swaps to a freshly processed result, force the
    // <video> element to reload from the new source.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.load();
    }, [videoUrl]);

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
                body: JSON.stringify({
                    postId,
                    trimStart,
                    trimEnd,
                    watermark,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Process failed (HTTP ${res.status})`);
            }
            // Cache-bust the URL so the browser actually fetches the new bytes.
            const fresh = `${json.staged_video_url}?t=${Date.now()}`;
            setVideoUrl(fresh);
            // New baseline: the trimmed video starts at 0 and runs for
            // (trimEnd - trimStart) seconds. Reset the slider state so the
            // operator can do a second trim on the already-trimmed clip if
            // they want.
            const newDuration = trimEnd - trimStart;
            initialEndSetForUrl.current = fresh; // prevent loadedmetadata from resetting end
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
        const sec = (s - m * 60);
        return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
    }

    const dur = duration ?? 0;
    const trimmedLen = Math.max(0, trimEnd - trimStart);

    return (
        <div className="space-y-3">
            {/* ── Video preview ─────────────────────────────────── */}
            <div
                className="rounded-2xl overflow-hidden relative"
                style={{
                    background: '#0a0a14',
                    border: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={handleLoadedMetadata}
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

            {/* ── Trim controls ─────────────────────────────────── */}
            <div
                className="rounded-2xl p-5 space-y-4"
                style={{
                    background: 'rgba(12, 12, 24, 0.55)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                <div className="flex items-baseline gap-3">
                    <span
                        className="text-[10px] font-bold uppercase tracking-[0.22em]"
                        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                    >
                        Trim
                    </span>
                    {duration !== null && (
                        <span
                            className="text-[10px] font-mono"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            {fmtTime(trimStart)} → {fmtTime(trimEnd)} · {trimmedLen.toFixed(1)}s of {dur.toFixed(1)}s
                        </span>
                    )}
                </div>

                <div className="space-y-2">
                    <label
                        className="block text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        Start ({fmtTime(trimStart)})
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={dur}
                        step={0.1}
                        value={trimStart}
                        disabled={busy || duration === null}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setTrimStart(v);
                            if (v >= trimEnd) setTrimEnd(Math.min(dur, v + 0.5));
                        }}
                        className="w-full"
                        style={{ accentColor: '#7b61ff' }}
                    />
                </div>

                <div className="space-y-2">
                    <label
                        className="block text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        End ({fmtTime(trimEnd)})
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={dur}
                        step={0.1}
                        value={trimEnd}
                        disabled={busy || duration === null}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setTrimEnd(v);
                            if (v <= trimStart) setTrimStart(Math.max(0, v - 0.5));
                        }}
                        className="w-full"
                        style={{ accentColor: '#7b61ff' }}
                    />
                </div>

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
                        Burn in <span style={{ color: '#9D7BFF' }}>@KumoLabAnime</span> watermark (bottom-right)
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
