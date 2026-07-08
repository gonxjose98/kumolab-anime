'use client';

import { useRef } from 'react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import type { Clip, Track } from './types';

/** Whole-timeline view: ruler + one row per track + clips + playhead. */
export default function Timeline() {
    const project = useProjectStore((s) => s.project);
    const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
    const pxPerSec = usePlaybackStore((s) => s.pxPerSec);
    const currentTime = usePlaybackStore((s) => s.currentTime);
    const scrollRef = useRef<HTMLDivElement | null>(null);

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

    // Ruler ticks — every 1s, labeled every 5s (adapt when zoomed out).
    const step = pxPerSec < 20 ? 5 : 1;
    const ticks: number[] = [];
    for (let s = 0; s <= dur + 2; s += step) ticks.push(s);

    return (
        <div className="st-timeline">
            <div className="st-timeline__bar">
                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => usePlaybackStore.getState().zoomBy(0.8)} title="Zoom out">−</button>
                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => usePlaybackStore.getState().zoomBy(1.25)} title="Zoom in">+</button>
                <span className="ak-caption" style={{ marginLeft: 4 }}>{fmt(currentTime)} / {fmt(project.durationSec)}</span>
            </div>

            <div className="st-timeline__scroll" ref={scrollRef}>
                <div className="st-timeline__inner" style={{ width: width + TRACK_HEADER_W, display: 'flex' }}>
                    {/* Sticky track-header rail */}
                    <div className="st-thead">
                        <div style={{ height: 22 }} />
                        {project.tracks.map((t) => (
                            <div key={t.id} className="st-thead__row">
                                <span style={{ textTransform: 'capitalize' }}>{t.kind}</span>
                            </div>
                        ))}
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

function ClipView({ clip, track, pxPerSec, selected }: { clip: Clip; track: Track; pxPerSec: number; selected: boolean }) {
    const left = clip.timelineStart * pxPerSec;
    const w = Math.max(6, clip.duration * pxPerSec);

    // Drag the body to move the clip along its track; drag a handle to trim.
    const startBodyDrag = (e: React.PointerEvent) => {
        if (track.locked) return;
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        useProjectStore.getState().select([clip.id]);
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
            onClick={(e) => { e.stopPropagation(); useProjectStore.getState().select([clip.id]); }}
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
