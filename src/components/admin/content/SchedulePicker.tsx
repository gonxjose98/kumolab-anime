'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CircleDot, Keyboard, Star } from 'lucide-react';

/**
 * SchedulePicker — reschedule a post's publish time two ways, both present:
 *   • Wheel  — iOS-style scroll wheels for Day / Hour / Minute / AM-PM.
 *   • Type   — a native datetime field for exact manual entry.
 * The toggle switches modes without losing the selection (both edit the same
 * underlying Date). Times are the operator's LOCAL time (KumoLab runs on ET),
 * and the summary flags whether the slot lands in an ET peak hour.
 *
 * Parent owns the save call; this component just resolves a Date via onSave.
 */

const ET = 'America/New_York';
const PREMIUM_HOURS_ET = new Set([12, 17, 18, 19, 20, 21, 22]);
const ITEM_H = 40;
const PAD = 80; // (wheel height 200 − item 40) / 2 → centers the selected row in the band

type Opt = { label: string; value: number };

const pad2 = (n: number) => String(n).padStart(2, '0');

function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function dayLabel(d: Date): string {
    const t0 = startOfLocalDay(new Date()).getTime();
    const diff = Math.round((startOfLocalDay(d).getTime() - t0) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function toLocalInputValue(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ET hour (0–23) of a Date, for peak-slot detection. */
function etHourOf(d: Date): number {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', hourCycle: 'h23' }).format(d);
    return Number(s) % 24;
}

function Wheel({ options, value, onChange, cap }: { options: Opt[]; value: number; onChange: (v: number) => void; cap: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const idx = Math.max(0, options.findIndex((o) => o.value === value));

    // Center the selected item whenever the value changes (mount + external edits).
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const target = idx * ITEM_H;
        if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    }, [idx]);

    // When scrolling settles, snap to the nearest row and report a real change.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let t: ReturnType<typeof setTimeout>;
        const onScroll = () => {
            clearTimeout(t);
            t = setTimeout(() => {
                const i = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / ITEM_H)));
                if (options[i] && options[i].value !== value) onChange(options[i].value);
            }, 90);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => { el.removeEventListener('scroll', onScroll); clearTimeout(t); };
    }, [options, value, onChange]);

    return (
        <div className="ak-wheel-col">
            <div className="ak-wheel__cap">{cap}</div>
            <div className="ak-wheel">
                <div className="ak-wheel__scroll" ref={ref}>
                    <div style={{ height: PAD }} aria-hidden />
                    {options.map((o) => (
                        <div
                            key={o.value}
                            className={`ak-wheel__item ${o.value === value ? 'ak-wheel__item--on' : ''}`}
                            onClick={() => onChange(o.value)}
                        >
                            {o.label}
                        </div>
                    ))}
                    <div style={{ height: PAD }} aria-hidden />
                </div>
            </div>
        </div>
    );
}

export default function SchedulePicker({
    title, initialIso, busy, error, onCancel, onSave,
}: {
    title: string;
    initialIso: string;
    busy?: boolean;
    error?: string | null;
    onCancel: () => void;
    onSave: (when: Date) => void;
}) {
    const init = new Date(initialIso);
    const [mode, setMode] = useState<'wheel' | 'type'>('wheel');
    const [dayMs, setDayMs] = useState(startOfLocalDay(init).getTime());
    const [hour24, setHour24] = useState(init.getHours());
    const [minute, setMinute] = useState(Math.min(55, Math.round(init.getMinutes() / 5) * 5));

    // Compose the final Date from the three fields.
    const when = new Date(dayMs);
    when.setHours(hour24, minute, 0, 0);

    // Wheel option lists.
    const days: Opt[] = Array.from({ length: 21 }, (_, i) => {
        const d = new Date(startOfLocalDay(new Date()).getTime() + i * 86_400_000);
        return { label: dayLabel(d), value: d.getTime() };
    });
    // If the post's own day is in the past (already-slotted earlier today edge), keep it selectable.
    if (!days.some((d) => d.value === dayMs)) {
        days.unshift({ label: dayLabel(new Date(dayMs)), value: dayMs });
    }
    const hours: Opt[] = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
    const minutes: Opt[] = Array.from({ length: 12 }, (_, i) => ({ label: pad2(i * 5), value: i * 5 }));
    const ampm: Opt[] = [{ label: 'AM', value: 0 }, { label: 'PM', value: 1 }];

    const hour12 = ((hour24 + 11) % 12) + 1;
    const isPm = hour24 >= 12 ? 1 : 0;
    const setHour12 = useCallback((h12: number) => setHour24((prev) => (h12 % 12) + (prev >= 12 ? 12 : 0)), []);
    const setAmPm = useCallback((pm: number) => setHour24((prev) => (prev % 12) + pm * 12), []);

    const etHour = etHourOf(when);
    const isPeak = PREMIUM_HOURS_ET.has(etHour);
    const outsideWindow = etHour < 7 || etHour >= 23;
    const isPast = when.getTime() < Date.now();

    // Keep manual input in sync.
    const onManual = (v: string) => {
        const d = new Date(v);
        if (isNaN(d.getTime())) return;
        setDayMs(startOfLocalDay(d).getTime());
        setHour24(d.getHours());
        setMinute(d.getMinutes());
    };

    return (
        <div className="ak-modal__scrim" onClick={onCancel}>
            <div className="ak-modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
                <div className="ak-modal__head">
                    <span className="ak-title">Reschedule</span>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onCancel} disabled={busy}>Close</button>
                </div>
                <div className="ak-modal__body">
                    <p className="ak-body-sm" style={{ marginBottom: 16, color: 'var(--ink-2)' }}>{title}</p>

                    <div className="ak-segmented" role="tablist" aria-label="Pick mode">
                        <button className={mode === 'wheel' ? 'is-on' : ''} onClick={() => setMode('wheel')} role="tab" aria-selected={mode === 'wheel'}>
                            <CircleDot size={14} /> Wheel
                        </button>
                        <button className={mode === 'type' ? 'is-on' : ''} onClick={() => setMode('type')} role="tab" aria-selected={mode === 'type'}>
                            <Keyboard size={14} /> Type
                        </button>
                    </div>

                    {mode === 'wheel' ? (
                        <div className="ak-wheel-row">
                            <div className="ak-wheel-row__band" aria-hidden />
                            <Wheel cap="Day" options={days} value={dayMs} onChange={setDayMs} />
                            <Wheel cap="Hour" options={hours} value={hour12} onChange={setHour12} />
                            <Wheel cap="Min" options={minutes} value={minute} onChange={setMinute} />
                            <Wheel cap="" options={ampm} value={isPm} onChange={setAmPm} />
                        </div>
                    ) : (
                        <div className="ak-field" style={{ marginTop: 4 }}>
                            <label className="ak-field__label">Publish date &amp; time</label>
                            <input
                                type="datetime-local"
                                value={toLocalInputValue(when)}
                                disabled={busy}
                                onChange={(e) => onManual(e.target.value)}
                                className="ak-field__input"
                            />
                            <span className="ak-field__help">Your local time. Exact to the minute.</span>
                        </div>
                    )}

                    <div className="ak-pick-summary">
                        <strong>{when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                        {' · '}
                        <strong>{when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong>
                        <span className={`ak-pick-peak ${isPeak ? 'ak-pick-peak--peak' : 'ak-pick-peak--off'}`}>
                            {isPeak ? <><Star size={10} /> Peak</> : 'Off-peak'}
                        </span>
                    </div>
                    {outsideWindow && (
                        <p className="ak-caption" style={{ textAlign: 'center', color: 'var(--gold-text)' }}>
                            Heads up: outside the usual 7am–11pm ET posting window.
                        </p>
                    )}
                    {isPast && (
                        <p className="ak-caption" style={{ textAlign: 'center', color: 'var(--gold-text)' }}>
                            This time is in the past — it will publish on the next cron tick.
                        </p>
                    )}
                    {error && <div className="ak-auth__err" style={{ marginTop: 12 }}>{error}</div>}
                </div>
                <div className="ak-modal__foot">
                    <button className="ak-btn ak-btn--secondary" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button className="ak-btn ak-btn--primary" onClick={() => onSave(when)} disabled={busy}>
                        {busy ? 'Saving…' : 'Save schedule'}
                    </button>
                </div>
            </div>
        </div>
    );
}
