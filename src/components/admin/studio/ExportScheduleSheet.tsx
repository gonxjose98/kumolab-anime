'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';

/**
 * ExportScheduleSheet: the post-export scheduling step in Studio.
 * Shown right after a reel is rendered, uploaded, and attached. Lets the
 * operator slot it without leaving Studio:
 *   Set: the wheel time (iOS-style Day / Hour / Min / AM-PM picker)
 *   Next peak slot: server picks the next open ET peak hour
 *   Now: publishes on the next publish tick
 *   Draft: parks it to finish later
 * Wheel mechanics, peak detection, and local-time handling mirror
 * SchedulePicker (src/components/admin/content/SchedulePicker.tsx).
 */

const ET = 'America/New_York';
const PREMIUM_HOURS_ET = new Set([12, 17, 18, 19, 20, 21, 22]);
const ITEM_H = 40;
const PAD = 80; // (wheel height 200 minus item 40) / 2, centers the selected row in the band

type Opt = { label: string; value: number };
type Mode = 'set' | 'peak' | 'now' | 'draft';

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

/** ET hour (0-23) of a Date, for peak-slot detection. */
function etHourOf(d: Date): number {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', hourCycle: 'h23' }).format(d);
    return Number(s) % 24;
}

function fmtWhen(d: Date): string {
    return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Now, rounded up to the next 5 minutes: a sensible wheel default. */
function defaultStart(): Date {
    const d = new Date(Date.now() + 60_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return d;
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

export default function ExportScheduleSheet({
    postId, onClose, resultUrl,
}: {
    postId: string;
    onClose: () => void;
    resultUrl?: string | null;
}) {
    const [init] = useState(defaultStart);
    const [dayMs, setDayMs] = useState(() => startOfLocalDay(init).getTime());
    const [hour24, setHour24] = useState(init.getHours());
    const [minute, setMinute] = useState(Math.min(55, init.getMinutes()));
    const [busy, setBusy] = useState<Mode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState<string | null>(null);

    // Compose the final Date from the three wheel fields.
    const when = new Date(dayMs);
    when.setHours(hour24, minute, 0, 0);

    // Wheel option lists (same shape as SchedulePicker).
    const days: Opt[] = Array.from({ length: 21 }, (_, i) => {
        const d = new Date(startOfLocalDay(new Date()).getTime() + i * 86_400_000);
        return { label: dayLabel(d), value: d.getTime() };
    });
    const hours: Opt[] = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
    const minutes: Opt[] = Array.from({ length: 12 }, (_, i) => ({ label: pad2(i * 5), value: i * 5 }));
    const ampm: Opt[] = [{ label: 'AM', value: 0 }, { label: 'PM', value: 1 }];

    const hour12 = ((hour24 + 11) % 12) + 1;
    const isPm = hour24 >= 12 ? 1 : 0;
    const setHour12 = useCallback((h12: number) => setHour24((prev) => (h12 % 12) + (prev >= 12 ? 12 : 0)), []);
    const setAmPm = useCallback((pm: number) => setHour24((prev) => (prev % 12) + pm * 12), []);

    const etHour = etHourOf(when);
    const isPeak = PREMIUM_HOURS_ET.has(etHour);
    const isPast = when.getTime() < Date.now();

    async function submit(mode: Mode) {
        setBusy(mode);
        setError(null);
        try {
            const body: Record<string, string> = { postId, mode };
            if (mode === 'set') body.scheduledTime = when.toISOString();
            const res = await fetch('/api/admin/studio/schedule', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Scheduling failed');
            if (mode === 'draft') setConfirmed('Saved as draft. Finish it any time from Content.');
            else if (mode === 'now') setConfirmed('Publishing now. It goes out on the next publish tick.');
            else setConfirmed(`Scheduled for ${fmtWhen(json.scheduledTime ? new Date(json.scheduledTime) : when)}.`);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Scheduling failed');
        } finally {
            setBusy(null);
        }
    }

    const locked = busy !== null;

    return (
        <div className="ak-modal__scrim" onClick={locked ? undefined : onClose}>
            <div className="ak-modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
                <div className="ak-modal__head">
                    <span className="ak-title">Schedule this reel</span>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} disabled={locked}>Close</button>
                </div>
                <div className="ak-modal__body">
                    {confirmed ? (
                        <div className="text-center flex flex-col items-center gap-2" style={{ padding: '8px 0' }}>
                            <CheckCircle2 size={34} style={{ color: '#1d7a4f' }} />
                            <div className="ak-heading" style={{ color: '#1d7a4f' }}>{confirmed}</div>
                            {resultUrl && (
                                <a className="ak-btn ak-btn--secondary ak-btn--sm" href={resultUrl} target="_blank" rel="noopener noreferrer">
                                    Preview file ↗
                                </a>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="ak-body-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                <CheckCircle2 size={16} style={{ color: '#1d7a4f', flexShrink: 0 }} />
                                <span style={{ color: '#1d7a4f', fontWeight: 700 }}>Exported &amp; attached.</span>
                                {resultUrl && (
                                    <a className="ak-btn ak-btn--ghost ak-btn--sm" href={resultUrl} target="_blank" rel="noopener noreferrer">
                                        Preview file ↗
                                    </a>
                                )}
                            </div>
                            <p className="ak-caption" style={{ textAlign: 'center', marginBottom: 12 }}>
                                Pick when this reel goes out. Times are your local time.
                            </p>

                            <div className="ak-wheel-row">
                                <div className="ak-wheel-row__band" aria-hidden />
                                <Wheel cap="Day" options={days} value={dayMs} onChange={setDayMs} />
                                <Wheel cap="Hour" options={hours} value={hour12} onChange={setHour12} />
                                <Wheel cap="Min" options={minutes} value={minute} onChange={setMinute} />
                                <Wheel cap="" options={ampm} value={isPm} onChange={setAmPm} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                                <div className="ak-pick-summary" style={{ marginTop: 0 }}>
                                    <strong>{when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                                    {' · '}
                                    <strong>{when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong>
                                    <span className={`ak-pick-peak ${isPeak ? 'ak-pick-peak--peak' : 'ak-pick-peak--off'}`}>
                                        {isPeak ? <><Star size={10} /> Peak</> : 'Off-peak'}
                                    </span>
                                </div>
                                <button className="ak-btn ak-btn--secondary ak-btn--sm" onClick={() => submit('set')} disabled={locked}>
                                    {busy === 'set' ? 'Setting…' : 'Set'}
                                </button>
                            </div>
                            {isPast && (
                                <p className="ak-caption" style={{ textAlign: 'center', marginTop: 8, color: 'var(--gold-text)' }}>
                                    This time is in the past: it will publish on the next tick.
                                </p>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                                <button className="ak-btn ak-btn--primary" onClick={() => submit('peak')} disabled={locked}>
                                    {busy === 'peak' ? 'Finding slot…' : 'Next peak slot'}
                                </button>
                                <button className="ak-btn ak-btn--secondary" onClick={() => submit('now')} disabled={locked}>
                                    {busy === 'now' ? 'Scheduling…' : 'Now'}
                                </button>
                                <button className="ak-btn ak-btn--danger" onClick={() => submit('draft')} disabled={locked}>
                                    {busy === 'draft' ? 'Saving…' : 'Draft'}
                                </button>
                            </div>

                            {error && <div className="ak-auth__err" style={{ marginTop: 12, textAlign: 'left' }}>{error}</div>}
                        </>
                    )}
                </div>
                <div className="ak-modal__foot">
                    {confirmed ? (
                        <button className="ak-btn ak-btn--primary" onClick={onClose}>Done</button>
                    ) : (
                        <button className="ak-btn ak-btn--ghost" onClick={onClose} disabled={locked}>Skip for now</button>
                    )}
                </div>
            </div>
        </div>
    );
}
