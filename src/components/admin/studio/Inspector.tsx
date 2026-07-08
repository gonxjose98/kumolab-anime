'use client';

import { Scissors, Trash2 } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import type { Clip, Track, ClipEffect, ClipEffectType } from './types';

/** Read a clip's effect amount (or the neutral default when unset). */
function effectVal(clip: Clip, type: ClipEffectType, neutral: number): number {
    const e = clip.effects?.find((x) => x.type === type);
    return e ? e.amount : neutral;
}
/** Return a new effects array with `type` set to `amount` (removed at neutral). */
function withEffect(clip: Clip, type: ClipEffectType, amount: number, neutral: number): ClipEffect[] {
    const rest = (clip.effects || []).filter((x) => x.type !== type);
    return amount === neutral ? rest : [...rest, { type, amount }];
}

function Check({ label, on, onToggle }: { label: string; on: boolean; onToggle: (on: boolean) => void }) {
    return (
        <label className="st-row" style={{ gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
            {label}
        </label>
    );
}

/** Right rail: properties of the selected clip. */
export default function Inspector() {
    const selected = useProjectStore((s) => s.selectedClipIds);
    const project = useProjectStore((s) => s.project);
    const found = project && selected[0] ? findClip(project, selected[0]) : null;

    return (
        <div className="st-panel st-inspector">
            <div className="st-panel__head">
                <span className="ak-overline">Inspector</span>
                {found && (
                    <div className="flex items-center gap-1">
                        <button className="ak-btn ak-btn--ghost ak-btn--sm" title="Split at playhead"
                            onClick={() => useProjectStore.getState().splitClip(found.clip.id, usePlaybackStore.getState().currentTime)}>
                            <Scissors size={14} />
                        </button>
                        <button className="ak-btn ak-btn--danger ak-btn--sm" title="Delete clip"
                            onClick={() => useProjectStore.getState().removeClip(found.clip.id)}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
            <div className="st-panel__body">
                {!found ? (
                    <div className="st-empty-hint">Select a clip to edit its properties.</div>
                ) : (
                    <ClipInspector clip={found.clip} track={found.track} />
                )}
            </div>
        </div>
    );
}

function ClipInspector({ clip, track }: { clip: Clip; track: Track }) {
    const set = (patch: Partial<Clip>) => useProjectStore.getState().updateClip(clip.id, patch);
    const setTransform = (patch: Partial<NonNullable<Clip['transform']>>) =>
        set({ transform: { ...(clip.transform ?? ({} as any)), ...patch } });
    const setText = (patch: Partial<NonNullable<Clip['text']>>) =>
        set({ text: { ...(clip.text ?? ({} as any)), ...patch } });

    return (
        <>
            <div className="st-field">
                <span className="st-field__label">Timing</span>
                <div className="ak-caption">
                    {clip.duration.toFixed(2)}s on timeline · source {clip.srcStart.toFixed(2)}–{clip.srcEnd.toFixed(2)}s
                </div>
            </div>

            {track.kind === 'text' && clip.text && (
                <>
                    <div className="st-field">
                        <span className="st-field__label">Text</span>
                        <textarea className="ak-field__input" style={{ height: 'auto', padding: 10, resize: 'vertical' }} rows={2}
                            value={clip.text.text} onChange={(e) => setText({ text: e.target.value })} />
                    </div>
                    <div className="st-field">
                        <span className="st-field__label">Color</span>
                        <div className="st-row">
                            <input type="color" value={clip.text.color} onChange={(e) => setText({ color: e.target.value })}
                                style={{ width: 40, height: 30, padding: 0, border: '1px solid var(--line-2)', borderRadius: 6, background: 'transparent' }} />
                            <select className="ak-field__input" value={clip.text.align ?? 'center'} onChange={(e) => setText({ align: e.target.value as any })}>
                                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                            </select>
                        </div>
                    </div>
                    <RangeRow label="Size" min={0.02} max={0.14} step={0.005} value={clip.text.sizePct}
                        fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setText({ sizePct: v })} />
                </>
            )}

            {(track.kind === 'video' || track.kind === 'image') && clip.transform && (
                <>
                    <div className="st-field">
                        <span className="st-field__label">Fit</span>
                        <div className="st-row">
                            <select className="ak-field__input" value={clip.transform.fit} onChange={(e) => setTransform({ fit: e.target.value as any })}>
                                <option value="contain">Contain (fit + fill)</option>
                                <option value="cover">Cover (crop)</option>
                            </select>
                        </div>
                    </div>
                    {clip.transform.fit === 'contain' && (
                        <div className="st-field">
                            <span className="st-field__label">Background fill</span>
                            <select className="ak-field__input" value={clip.transform.fillStyle ?? 'blur'} onChange={(e) => setTransform({ fillStyle: e.target.value as any })}>
                                <option value="blur">Blur</option><option value="black">Black</option><option value="white">White</option>
                            </select>
                        </div>
                    )}
                    <RangeRow label="Scale" min={0.2} max={3} step={0.05} value={clip.transform.scale}
                        fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ scale: v })} />
                    <RangeRow label="Opacity" min={0} max={1} step={0.05} value={clip.transform.opacity}
                        fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ opacity: v })} />
                    <RangeRow label="Position X" min={0} max={1} step={0.01} value={clip.transform.xPct}
                        fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ xPct: v })} />
                    <RangeRow label="Position Y" min={0} max={1} step={0.01} value={clip.transform.yPct}
                        fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ yPct: v })} />

                    {/* Colour effects */}
                    <RangeRow label="Brightness" min={-0.5} max={0.5} step={0.02} value={effectVal(clip, 'brightness', 0)}
                        fmt={(v) => v.toFixed(2)} onChange={(v) => set({ effects: withEffect(clip, 'brightness', v, 0) })} />
                    <RangeRow label="Contrast" min={0.5} max={1.8} step={0.02} value={effectVal(clip, 'contrast', 1)}
                        fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ effects: withEffect(clip, 'contrast', v, 1) })} />
                    <RangeRow label="Saturation" min={0} max={2.5} step={0.05} value={effectVal(clip, 'saturation', 1)}
                        fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ effects: withEffect(clip, 'saturation', v, 1) })} />
                    <RangeRow label="Blur" min={0} max={20} step={1} value={effectVal(clip, 'blur', 0)}
                        fmt={(v) => (v ? `${Math.round(v)}px` : 'off')} onChange={(v) => set({ effects: withEffect(clip, 'blur', v, 0) })} />
                    <div className="st-field">
                        <span className="st-field__label">Filters</span>
                        <div className="st-row" style={{ gap: 12, flexWrap: 'wrap' }}>
                            <Check label="Grayscale" on={effectVal(clip, 'grayscale', 0) > 0} onToggle={(on) => set({ effects: withEffect(clip, 'grayscale', on ? 1 : 0, 0) })} />
                            <Check label="Fade in" on={!!clip.fadeIn} onToggle={(on) => set({ fadeIn: on ? 0.4 : 0 })} />
                            <Check label="Fade out" on={!!clip.fadeOut} onToggle={(on) => set({ fadeOut: on ? 0.4 : 0 })} />
                        </div>
                    </div>
                </>
            )}

            {track.kind !== 'text' && (
                <RangeRow label="Speed" min={0.25} max={4} step={0.05} value={clip.speed}
                    fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ speed: v, duration: (clip.srcEnd - clip.srcStart) / v })} />
            )}
            {(track.kind === 'video' || track.kind === 'audio') && (
                <RangeRow label="Volume" min={0} max={1} step={0.05} value={clip.volume}
                    fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ volume: v })} />
            )}
        </>
    );
}

function RangeRow({ label, min, max, step, value, fmt, onChange }: {
    label: string; min: number; max: number; step: number; value: number; fmt: (v: number) => string; onChange: (v: number) => void;
}) {
    return (
        <div className="st-field">
            <span className="st-field__label">{label}</span>
            <div className="st-row">
                <input className="st-range" type="range" min={min} max={max} step={step} value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))} />
                <span className="st-num">{fmt(value)}</span>
            </div>
        </div>
    );
}

function findClip(project: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>, clipId: string) {
    for (const track of project.tracks) {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip) return { clip, track };
    }
    return null;
}
