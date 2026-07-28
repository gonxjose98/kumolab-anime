'use client';

import { useState } from 'react';
import { Scissors, Trash2 } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { saveTextTemplate } from './textTemplate';
import { retimeWords } from './autoCaptions';
import type { Clip, Track, ClipEffect, ClipEffectType, TextStyle } from './types';

/** Tap a word to give it its own colour (highlight key words). Only shown for
 *  multi-word captions. Indices track the space-split words, matching paintText. */
function WordColors({ clipId, text, wordColors, baseColor, onChange }: {
    clipId: string; text: string; wordColors: (string | null)[] | undefined; baseColor: string;
    onChange: (wc: (string | null)[] | undefined) => void;
}) {
    const [sel, setSel] = useState<number | null>(null);
    const words = text.split(' ');
    const wc = wordColors ?? [];
    if (words.filter(Boolean).length < 2) return null;

    const setWord = (i: number, color: string | null) => {
        const next = words.map((_, idx) => (idx === i ? color : wc[idx] ?? null));
        while (next.length && next[next.length - 1] == null) next.pop();
        onChange(next.length ? next : undefined);
    };

    return (
        <div className="st-field" key={clipId}>
            <span className="st-field__label">Word colors</span>
            <div className="st-wordchips">
                {words.map((w, i) => (w ? (
                    <button key={i} type="button"
                        className={`st-wordchip ${sel === i ? 'st-wordchip--sel' : ''} ${wc[i] ? 'st-wordchip--set' : ''}`}
                        style={{ color: wc[i] || baseColor }}
                        onClick={() => setSel(sel === i ? null : i)}>
                        {w}
                    </button>
                ) : null))}
            </div>
            {sel != null && words[sel] && (
                <div className="st-row" style={{ marginTop: 8, gap: 8 }}>
                    <input type="color" value={wc[sel] || baseColor} onChange={(e) => setWord(sel, e.target.value)}
                        style={{ width: 40, height: 32, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent', flex: 'none' }} />
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => setWord(sel, null)}>Reset word</button>
                </div>
            )}
            <span className="st-hint">Tap a word, then pick a colour to highlight it.</span>
        </div>
    );
}

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

/** Segmented button group — a clearer, more tactile control than a raw select
 *  for the Frame's Fit / Background choices. */
function Seg<T extends string>({ value, options, onChange }: {
    value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
    return (
        <div className="st-seg" role="group">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={`st-seg__btn ${value === o.value ? 'st-seg__btn--on' : ''}`}
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function Check({ label, on, onToggle }: { label: string; on: boolean; onToggle: (on: boolean) => void }) {
    return (
        <label className="st-row" style={{ gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
            {label}
        </label>
    );
}

/** Right rail: properties of the selected clip, or of a whole selection. */
export default function Inspector() {
    const selected = useProjectStore((s) => s.selectedClipIds);
    const project = useProjectStore((s) => s.project);
    const found = project && selected[0] ? findClip(project, selected[0]) : null;
    const many = selected.length > 1;

    return (
        <div className="st-panel st-inspector">
            <div className="st-panel__head">
                <span className="ak-overline">Inspector</span>
                {found && (
                    <div className="flex items-center gap-1">
                        {!many && (
                            <button className="ak-btn ak-btn--ghost ak-btn--sm" title="Split at playhead"
                                onClick={() => useProjectStore.getState().splitClip(found.clip.id, usePlaybackStore.getState().currentTime)}>
                                <Scissors size={14} />
                            </button>
                        )}
                        <button
                            className="ak-btn ak-btn--danger ak-btn--sm"
                            title={many ? `Delete ${selected.length} clips` : 'Delete clip'}
                            onClick={() => {
                                const store = useProjectStore.getState();
                                // Snapshot the ids: removeClip mutates the selection.
                                for (const id of [...selected]) store.removeClip(id);
                            }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
            <div className="st-panel__body">
                {!found ? (
                    <div className="st-empty-hint">Select a clip to edit its properties.</div>
                ) : many ? (
                    <MultiInspector ids={selected} />
                ) : (
                    <ClipInspector clip={found.clip} track={found.track} />
                )}
            </div>
        </div>
    );
}

/**
 * Editing several clips at once.
 *
 * The point of multi-select is restyling a whole caption track without opening
 * 30 clips one at a time, so this exposes the properties that are worth
 * changing in bulk and applies each edit to every selected clip. Text patches
 * are merged per clip, so each keeps its own words and karaoke timings.
 *
 * Values shown are the first selected clip's. Editing one pushes it to all,
 * which is the behaviour people expect from a bulk edit.
 */
function MultiInspector({ ids }: { ids: string[] }) {
    const project = useProjectStore((s) => s.project);
    const clips = (project ? ids.map((id) => findClip(project, id)?.clip).filter(Boolean) : []) as Clip[];
    if (!clips.length) return null;

    const textClips = clips.filter((c) => !!c.text);
    const allText = textClips.length === clips.length;
    const first = textClips[0];

    const setTextAll = (patch: Partial<TextStyle>) => {
        const store = useProjectStore.getState();
        for (const c of textClips) {
            store.updateClip(c.id, { text: { ...(c.text as TextStyle), ...patch } });
        }
    };
    const setTransformAll = (patch: Partial<NonNullable<Clip['transform']>>) => {
        const store = useProjectStore.getState();
        for (const c of clips) {
            store.updateClip(c.id, { transform: { ...(c.transform ?? ({} as any)), ...patch } });
        }
    };

    return (
        <>
            <div className="st-field">
                <span className="st-field__label">Selection</span>
                <div className="ak-caption">
                    {clips.length} clips selected{allText ? '' : ' (mixed kinds)'}. Changes apply to all of them.
                </div>
            </div>

            {allText && first?.text && (
                <>
                    <div className="st-section">
                        <span className="st-section__title">Text style</span>
                        <div className="st-field">
                            <span className="st-field__label">Color &amp; align</span>
                            <div className="st-row" style={{ gap: 10 }}>
                                <input type="color" value={first.text.color}
                                    onChange={(e) => setTextAll({ color: e.target.value })}
                                    style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent', flex: 'none' }} />
                                <div style={{ flex: 1 }}>
                                    <Seg
                                        value={first.text.align ?? 'center'}
                                        options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
                                        onChange={(v) => setTextAll({ align: v })}
                                    />
                                </div>
                            </div>
                        </div>
                        <RangeRow label="Size" min={0.02} max={0.2} step={0.005} value={first.text.sizePct}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTextAll({ sizePct: v })} />
                    </div>

                    {textClips.some((c) => c.text?.words?.length) && (
                        <div className="st-section">
                            <span className="st-section__title">Karaoke</span>
                            <div className="st-field">
                                <span className="st-field__label">Spoken word</span>
                                <div className="st-row" style={{ gap: 10 }}>
                                    <input type="color" value={first.text.highlightColor || '#ffd76e'}
                                        onChange={(e) => setTextAll({ highlightColor: e.target.value })}
                                        style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent', flex: 'none' }} />
                                    <button
                                        className={`ak-btn ak-btn--sm ${first.text.highlightBg ? 'ak-btn--primary' : 'ak-btn--secondary'}`}
                                        style={{ flex: 1 }}
                                        onClick={() => setTextAll({ highlightBg: first.text?.highlightBg ? null : '#1d4ed8' })}
                                    >
                                        {first.text.highlightBg ? 'Pill on' : 'Pill off'}
                                    </button>
                                </div>
                            </div>
                            <span className="st-hint">Restyle every caption at once.</span>
                        </div>
                    )}
                </>
            )}

            <div className="st-section">
                <span className="st-section__title">Position</span>
                <RangeRow label="Position Y" min={0} max={1} step={0.01} value={clips[0].transform?.yPct ?? 0.8}
                    fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransformAll({ yPct: v })} />
                <RangeRow label="Position X" min={0} max={1} step={0.01} value={clips[0].transform?.xPct ?? 0.5}
                    fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransformAll({ xPct: v })} />
            </div>
        </>
    );
}

function ClipInspector({ clip, track }: { clip: Clip; track: Track }) {
    const set = (patch: Partial<Clip>) => useProjectStore.getState().updateClip(clip.id, patch);
    const setTransform = (patch: Partial<NonNullable<Clip['transform']>>) =>
        set({ transform: { ...(clip.transform ?? ({} as any)), ...patch } });
    const setText = (patch: Partial<NonNullable<Clip['text']>>) =>
        set({ text: { ...(clip.text ?? ({} as any)), ...patch } });
    const [tplSaved, setTplSaved] = useState(false);

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
                    <div className="st-section">
                        <span className="st-section__title">Text</span>
                        <div className="st-field">
                            <span className="st-field__label">Content</span>
                            <textarea className="ak-field__input" style={{ height: 'auto', padding: 10, resize: 'vertical' }} rows={2}
                                value={clip.text.text}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    // On a caption clip the word timings must follow the
                                    // edit, or fixing one misheard word desyncs the line.
                                    setText(clip.text?.words?.length
                                        ? { text: next, words: retimeWords(clip.text.words, next) }
                                        : { text: next });
                                }} />
                        </div>
                        <div className="st-field">
                            <span className="st-field__label">Color &amp; align</span>
                            <div className="st-row" style={{ gap: 10 }}>
                                <input type="color" value={clip.text.color} onChange={(e) => setText({ color: e.target.value })}
                                    style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent', flex: 'none' }} />
                                <div style={{ flex: 1 }}>
                                    <Seg
                                        value={clip.text.align ?? 'center'}
                                        options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
                                        onChange={(v) => setText({ align: v })}
                                    />
                                </div>
                            </div>
                        </div>
                        <RangeRow label="Size" min={0.02} max={0.2} step={0.005} value={clip.text.sizePct}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setText({ sizePct: v })} />
                        <WordColors clipId={clip.id} text={clip.text.text} wordColors={clip.text.wordColors}
                            baseColor={clip.text.color} onChange={(wc) => setText({ wordColors: wc })} />
                    </div>

                    {/* Karaoke controls, only meaningful once a clip carries word timings. */}
                    {!!clip.text.words?.length && (
                        <div className="st-section">
                            <span className="st-section__title">Karaoke</span>
                            <div className="st-field">
                                <span className="st-field__label">Spoken word</span>
                                <div className="st-row" style={{ gap: 10 }}>
                                    <input type="color" value={clip.text.highlightColor || '#ffd76e'}
                                        onChange={(e) => setText({ highlightColor: e.target.value })}
                                        style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent', flex: 'none' }} />
                                    <button
                                        className={`ak-btn ak-btn--sm ${clip.text.highlightBg ? 'ak-btn--primary' : 'ak-btn--secondary'}`}
                                        style={{ flex: 1 }}
                                        onClick={() => setText({ highlightBg: clip.text?.highlightBg ? null : '#1d4ed8' })}
                                    >
                                        {clip.text.highlightBg ? 'Pill on' : 'Pill off'}
                                    </button>
                                    {clip.text.highlightBg && (
                                        <input type="color" value={clip.text.highlightBg}
                                            onChange={(e) => setText({ highlightBg: e.target.value })}
                                            style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--line-2)', borderRadius: 8, background: 'transparent', flex: 'none' }} />
                                    )}
                                </div>
                            </div>
                            <span className="st-hint">
                                {clip.text.words.length} timed word{clip.text.words.length === 1 ? '' : 's'}. Editing the
                                text above keeps them in sync.
                            </span>
                        </div>
                    )}

                    <div className="st-section">
                        <span className="st-section__title">Position</span>
                        <RangeRow label="Position Y" min={0} max={1} step={0.01} value={clip.transform?.yPct ?? 0.8}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ yPct: v })} />
                        <RangeRow label="Position X" min={0} max={1} step={0.01} value={clip.transform?.xPct ?? 0.5}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ xPct: v })} />
                        <span className="st-hint">Lower third by default. Slide Y up toward the top, down toward the bottom.</span>
                    </div>

                    <div className="st-section">
                        <button className="ak-btn ak-btn--secondary ak-btn--sm ak-btn--block"
                            onClick={() => {
                                const t = clip.text as TextStyle;
                                saveTextTemplate({
                                    style: { color: t.color, sizePct: t.sizePct, weight: t.weight, align: t.align, bg: t.bg, strokePx: t.strokePx, strokeColor: t.strokeColor },
                                    xPct: clip.transform?.xPct ?? 0.5,
                                    yPct: clip.transform?.yPct ?? 0.8,
                                });
                                setTplSaved(true);
                                setTimeout(() => setTplSaved(false), 1600);
                            }}>
                            {tplSaved ? 'Saved as template ✓' : 'Save as template'}
                        </button>
                        <span className="st-hint">New text clips reuse this style and placement.</span>
                    </div>
                </>
            )}

            {(track.kind === 'video' || track.kind === 'image') && clip.transform && (
                <>
                    {/* ── Frame: how the clip fills the vertical canvas ── */}
                    <div className="st-section">
                        <span className="st-section__title">Frame</span>
                        <div className="st-field">
                            <span className="st-field__label">Fit</span>
                            <Seg
                                value={clip.transform.fit}
                                options={[{ value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Crop' }]}
                                onChange={(v) => setTransform({ fit: v })}
                            />
                            <span className="st-hint">{clip.transform.fit === 'contain' ? 'Whole clip visible, sides filled.' : 'Fills the frame, edges cropped.'}</span>
                        </div>
                        {clip.transform.fit === 'contain' && (
                            <>
                                <div className="st-field">
                                    <span className="st-field__label">Background</span>
                                    <Seg
                                        value={clip.transform.fillStyle ?? 'blur'}
                                        options={[{ value: 'blur', label: 'Blur' }, { value: 'black', label: 'Black' }, { value: 'white', label: 'White' }]}
                                        onChange={(v) => setTransform({ fillStyle: v })}
                                    />
                                </div>
                                {(clip.transform.fillStyle ?? 'blur') === 'blur' && (
                                    <RangeRow label="Background blur" min={0} max={160} step={2} value={clip.transform.blurIntensity ?? 60}
                                        fmt={(v) => (v <= 1 ? 'off' : `${Math.round(v)}`)} onChange={(v) => setTransform({ blurIntensity: v })} />
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Position & size ── */}
                    <div className="st-section">
                        <span className="st-section__title">Position &amp; size</span>
                        <RangeRow label="Scale" min={0.2} max={3} step={0.05} value={clip.transform.scale}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ scale: v })} />
                        <RangeRow label="Position X" min={0} max={1} step={0.01} value={clip.transform.xPct}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ xPct: v })} />
                        <RangeRow label="Position Y" min={0} max={1} step={0.01} value={clip.transform.yPct}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ yPct: v })} />
                        <RangeRow label="Opacity" min={0} max={1} step={0.05} value={clip.transform.opacity}
                            fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTransform({ opacity: v })} />
                    </div>

                    {/* ── Adjust: colour + soften (whole-clip effects, distinct from
                         the background Blur above) ── */}
                    <div className="st-section">
                        <span className="st-section__title">Adjust</span>
                        <RangeRow label="Brightness" min={-0.5} max={0.5} step={0.02} value={effectVal(clip, 'brightness', 0)}
                            fmt={(v) => v.toFixed(2)} onChange={(v) => set({ effects: withEffect(clip, 'brightness', v, 0) })} />
                        <RangeRow label="Contrast" min={0.5} max={1.8} step={0.02} value={effectVal(clip, 'contrast', 1)}
                            fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ effects: withEffect(clip, 'contrast', v, 1) })} />
                        <RangeRow label="Saturation" min={0} max={2.5} step={0.05} value={effectVal(clip, 'saturation', 1)}
                            fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ effects: withEffect(clip, 'saturation', v, 1) })} />
                        <RangeRow label="Soften" min={0} max={20} step={1} value={effectVal(clip, 'blur', 0)}
                            fmt={(v) => (v ? `${Math.round(v)}px` : 'off')} onChange={(v) => set({ effects: withEffect(clip, 'blur', v, 0) })} />
                        <div className="st-field">
                            <span className="st-field__label">Filters</span>
                            <div className="st-row" style={{ gap: 12, flexWrap: 'wrap' }}>
                                <Check label="Grayscale" on={effectVal(clip, 'grayscale', 0) > 0} onToggle={(on) => set({ effects: withEffect(clip, 'grayscale', on ? 1 : 0, 0) })} />
                                <Check label="Fade in" on={!!clip.fadeIn} onToggle={(on) => set({ fadeIn: on ? 0.4 : 0 })} />
                                <Check label="Fade out" on={!!clip.fadeOut} onToggle={(on) => set({ fadeOut: on ? 0.4 : 0 })} />
                            </div>
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
