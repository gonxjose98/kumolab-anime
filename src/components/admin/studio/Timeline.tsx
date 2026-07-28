'use client';

import { useEffect, useRef, useState } from 'react';
import { Type, Droplet, CheckSquare } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { addTextClip } from './clipFactory';
import type { Clip, Track } from './types';
import AutoCaptionsButton from './AutoCaptionsButton';
import VoiceoverPanel from './VoiceoverPanel';

/** Whole-timeline view: ruler + one row per track + clips + playhead. */
export default function Timeline() {
    const project = useProjectStore((s) => s.project);
    const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
    const pxPerSec = usePlaybackStore((s) => s.pxPerSec);
    const currentTime = usePlaybackStore((s) => s.currentTime);
    const isPlaying = usePlaybackStore((s) => s.isPlaying);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    // Touch has no ctrl/shift, so multi-select is an explicit mode there.
    const [multiSelect, setMultiSelect] = useState(false);
    // Whether the opening zoom has been fitted to this project yet.
    const fittedRef = useRef(false);

    /**
     * Fit the whole clip on screen when the editor opens.
     *
     * The default zoom is a fixed 40px/sec, which on a phone shows about six
     * seconds — you land in the middle of a condensed strip with no sense of
     * the whole video, which makes trimming guesswork. Fit once per project so
     * the first view shows everything, then never fight the operator's own
     * zooming afterwards.
     */
    useEffect(() => {
        if (fittedRef.current) return;
        const el = scrollRef.current;
        const dur = project?.durationSec ?? 0;
        if (!el || dur <= 0) return;
        const lane = el.clientWidth - TRACK_HEADER_W - 16;   // 16 = breathing room
        if (lane <= 0) return;
        usePlaybackStore.getState().setPxPerSec(lane / dur);
        el.scrollLeft = 0;
        fittedRef.current = true;
    }, [project?.durationSec]);

    // While playing, keep the timeline scrolled so the playhead stays put —
    // the video scrubs the strip past the head instead of the head running off
    // screen. The scroll handler ignores these programmatic scrolls (it only
    // scrubs while paused), so there's no feedback loop.
    useEffect(() => {
        if (!isPlaying) return;
        const scroll = scrollRef.current;
        if (!scroll) return;
        let raf = 0;
        const follow = () => {
            const pb = usePlaybackStore.getState();
            scroll.scrollLeft = pb.currentTime * pb.pxPerSec;
            raf = requestAnimationFrame(follow);
        };
        raf = requestAnimationFrame(follow);
        return () => cancelAnimationFrame(raf);
    }, [isPlaying]);

    if (!project) return null;

    const dur = Math.max(project.durationSec, 10);
    const width = dur * pxPerSec + 200;

    const seekFromEvent = (e: React.PointerEvent) => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        const rect = scroll.getBoundingClientRect();
        const x = e.clientX - rect.left + scroll.scrollLeft - TRACK_HEADER_W;
        usePlaybackStore.getState().setCurrentTime(Math.max(0, x / pxPerSec));
    };

    // Scrolling/swiping the timeline scrubs the video: the scroll position
    // drives currentTime so the preview follows the strip. Guarded to only run
    // while paused, so the play-follow effect above doesn't re-trigger it.
    const onScrub = () => {
        if (usePlaybackStore.getState().isPlaying) return;
        const scroll = scrollRef.current;
        if (!scroll) return;
        const t = scroll.scrollLeft / usePlaybackStore.getState().pxPerSec;
        usePlaybackStore.getState().setCurrentTime(Math.min(project.durationSec, Math.max(0, t)));
    };

    // Grabbing the timeline during playback pauses it, so the swipe scrubs
    // rather than fighting the auto-follow.
    const onGrab = () => {
        if (usePlaybackStore.getState().isPlaying) usePlaybackStore.getState().pause();
    };

    // Ruler ticks — every 1s, labeled every 5s (adapt when zoomed out).
    // Widen the tick spacing when zoomed right out, or a fitted 2min project
    // draws a tick every few pixels.
    const step = pxPerSec < 6 ? 15 : pxPerSec < 20 ? 5 : 1;
    const ticks: number[] = [];
    for (let s = 0; s <= dur + 2; s += step) ticks.push(s);

    return (
        <div className="st-timeline">
            <div className="st-timeline__bar">
                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => usePlaybackStore.getState().zoomBy(0.8)} title="Zoom out">−</button>
                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => usePlaybackStore.getState().zoomBy(1.25)} title="Zoom in">+</button>
                <span className="ak-caption st-time" style={{ marginLeft: 4 }}>{fmt(currentTime)} / {fmt(project.durationSec)}</span>
                {/* Always-visible content actions (were buried in the collapsed
                    Media panel / the Export dialog on mobile). */}
                <button className="ak-btn ak-btn--secondary ak-btn--sm" title="Add a text overlay at the playhead"
                    onClick={() => addTextClip(usePlaybackStore.getState().currentTime)}>
                    <Type size={13} /> Add text
                </button>
                <AutoCaptionsButton />
                <VoiceoverPanel />
                {/* Deliberately understated: a phone has no ctrl/shift, so this is
                    the only way to pick several clips there. Off by default so it
                    never gets in the way of a single-clip edit. */}
                <button
                    className={`ak-btn ak-btn--sm ${multiSelect ? 'ak-btn--secondary' : 'ak-btn--ghost'}`}
                    onClick={() => {
                        setMultiSelect((v) => {
                            if (v) useProjectStore.getState().clearSelection();
                            return !v;
                        });
                    }}
                    aria-pressed={multiSelect}
                    title="Tap several clips to edit them together"
                >
                    <CheckSquare size={13} />
                    {multiSelect
                        ? (selectedClipIds.length ? `${selectedClipIds.length} selected` : 'Tap clips')
                        : 'Select'}
                </button>
                <div className="st-spacer" />
                <button
                    className={`ak-btn ak-btn--sm ${project.meta.watermark ? 'ak-btn--secondary' : 'ak-btn--ghost'}`}
                    title="Toggle the @kumolabanime watermark (burned in on export)"
                    aria-pressed={project.meta.watermark}
                    onClick={() => {
                        const cur = useProjectStore.getState().project?.meta.watermark ?? true;
                        useProjectStore.getState().setMeta({ watermark: !cur });
                    }}
                >
                    <Droplet size={13} /> {project.meta.watermark ? 'Watermark on' : 'Watermark off'}
                </button>
            </div>

            <div className="st-timeline__scroll" ref={scrollRef} onScroll={onScrub} onPointerDown={onGrab}>
                <div className="st-timeline__inner" style={{ width: width + TRACK_HEADER_W, display: 'flex' }}>
                    {/* Sticky track-header rail */}
                    <div className="st-thead">
                        <div style={{ height: 22 }} />
                        {project.tracks.map((t) => {
                            const ids = t.clips.map((c) => c.id);
                            const allSelected = ids.length > 0 && ids.every((id) => selectedClipIds.includes(id));
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={`st-thead__row ${allSelected ? 'st-thead__row--on' : ''}`}
                                    // Tapping the track name selects everything on it — the
                                    // fast path for restyling a whole caption track at once.
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!ids.length) return;
                                        useProjectStore.getState().select(allSelected ? [] : ids);
                                    }}
                                    title={ids.length ? `Select all ${ids.length} on this track` : 'No clips on this track'}
                                >
                                    <span className="st-thead__dot" style={{ background: TRACK_DOT[t.kind] }} />
                                    <span>{t.kind}</span>
                                    {ids.length > 1 && <span className="st-thead__n">{ids.length}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Lanes */}
                    <div style={{ position: 'relative', width, flex: 'none' }}>
                        <div className="st-ruler" onPointerDown={seekFromEvent} style={{ cursor: 'text' }}>
                            {ticks.map((s) => (
                                <div key={s} className="st-ruler__tick" style={{ left: s * pxPerSec }}>
                                    {s % (step === 5 ? 5 : 5) === 0 ? `${s}s` : ''}
                                </div>
                            ))}
                        </div>

                        {project.tracks.map((track) => (
                            <div key={track.id} className={`st-track st-track--${track.kind}`}>
                                {track.clips.map((clip) => (
                                    <ClipView
                                        key={clip.id}
                                        clip={clip}
                                        track={track}
                                        pxPerSec={pxPerSec}
                                        selected={selectedClipIds.includes(clip.id)}
                                        multi={multiSelect}
                                    />
                                ))}
                            </div>
                        ))}

                        {project.tracks.length === 0 && (
                            <div className="st-empty-hint">Import media from the left, then drag it here (or it lands on a new track automatically).</div>
                        )}

                        <div className="st-playhead" style={{ left: currentTime * pxPerSec }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

const TRACK_HEADER_W = 128;

const TRACK_DOT: Record<string, string> = {
    video: '#4a9eff',
    audio: '#3ecf8e',
    text: '#f4c869',
    image: '#a78bfa',
};

function ClipView({ clip, track, pxPerSec, selected, multi }: { clip: Clip; track: Track; pxPerSec: number; selected: boolean; multi: boolean }) {
    const left = clip.timelineStart * pxPerSec;
    const w = Math.max(6, clip.duration * pxPerSec);

    // Drag the body to move the clip along its track; drag a handle to trim.
    const startBodyDrag = (e: React.PointerEvent) => {
        if (track.locked) return;
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        // Pointerdown runs BEFORE click, so selecting unconditionally here would
        // wipe the selection and make the click handler's ctrl-toggle undo
        // itself. Leave it alone when the gesture is additive, or when this clip
        // is already part of the selection (so a group survives a drag).
        const store = useProjectStore.getState();
        const additive = multi || e.ctrlKey || e.metaKey || e.shiftKey;
        if (!additive && !store.selectedClipIds.includes(clip.id)) store.select([clip.id]);
        const startX = e.clientX;
        const origStart = clip.timelineStart;
        const move = (ev: PointerEvent) => {
            const dt = (ev.clientX - startX) / pxPerSec;
            useProjectStore.getState().updateClip(clip.id, { timelineStart: Math.max(0, origStart + dt) });
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    const startTrim = (edge: 'start' | 'end') => (e: React.PointerEvent) => {
        if (track.locked) return;
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        useProjectStore.getState().select([clip.id]);
        const startX = e.clientX;
        let last = 0;
        const move = (ev: PointerEvent) => {
            const total = (ev.clientX - startX) / pxPerSec;
            const delta = total - last;
            last = total;
            useProjectStore.getState().trimClip(clip.id, edge, delta);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    const label = clip.text?.text || clip.mediaId ? (clip.text?.text || nameFor(clip)) : 'clip';

    return (
        <div
            className={`st-clip st-clip--${track.kind} ${selected ? 'st-clip--selected' : ''}`}
            style={{ left, width: w }}
            onPointerDown={startBodyDrag}
            onClick={(e) => {
                e.stopPropagation();
                const store = useProjectStore.getState();
                // Ctrl/Cmd-click (or any tap while multi-select is on) toggles.
                if (multi || e.ctrlKey || e.metaKey) { store.toggleSelect(clip.id); return; }
                // Shift-click extends from the last pick to here, within this track.
                if (e.shiftKey && store.selectedClipIds.length) {
                    const ids = track.clips.map((c) => c.id);
                    const anchor = [...store.selectedClipIds].reverse().find((id) => ids.includes(id));
                    const from = anchor ? ids.indexOf(anchor) : -1;
                    const to = ids.indexOf(clip.id);
                    if (from >= 0 && to >= 0) {
                        const [a, b] = from <= to ? [from, to] : [to, from];
                        store.select(ids.slice(a, b + 1));
                        return;
                    }
                }
                store.select([clip.id]);
            }}
        >
            <div className="st-clip__handle st-clip__handle--l" onPointerDown={startTrim('start')} />
            <span className="st-clip__label">{label}</span>
            <div className="st-clip__handle st-clip__handle--r" onPointerDown={startTrim('end')} />
        </div>
    );
}

function nameFor(clip: Clip): string {
    const p = useProjectStore.getState().project;
    const m = p?.media.find((x) => x.id === clip.mediaId);
    return m?.name || 'clip';
}

function fmt(s: number): string {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}
