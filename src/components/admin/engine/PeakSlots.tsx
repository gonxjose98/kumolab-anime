'use client';

import { useState } from 'react';
import { Save, Check, AlertTriangle, Clock } from 'lucide-react';
import type { PeakSlot } from '@/lib/engine/engine-config';

/**
 * The 3 peak posting slots, editable. Times are ET (24h, "HH:MM"); the local
 * equivalents for KumoLab's audience (Japan, Mexico, US West) are computed live
 * so you see who each slot hits as you change it. Offsets assume US Eastern DST
 * (EDT, the July-Nov half-year): JST = ET+13, Mexico City = ET-2, PT = ET-3.
 */

// EDT-relative offsets (hours) for the audience zones.
const ZONES: { label: string; offset: number }[] = [
    { label: 'JST', offset: +13 },   // Japan
    { label: 'MX', offset: -2 },     // Mexico City (CST, no DST)
    { label: 'PT', offset: -3 },     // US Pacific (PDT)
];

/** Add an hour offset to an "HH:MM" ET time; returns a 12h label with a +1/-1 day marker. */
function shift(hhmm: string, offset: number): string {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!m) return '—';
    let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + offset * 60;
    let dayMark = '';
    while (total < 0) { total += 1440; dayMark = ' -1d'; }
    while (total >= 1440) { total -= 1440; dayMark = ' +1d'; }
    const h24 = Math.floor(total / 60);
    const mm = total % 60;
    const ampm = h24 < 12 ? 'am' : 'pm';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(mm).padStart(2, '0')}${ampm}${dayMark}`;
}

function etLabel(hhmm: string): string {
    return shift(hhmm, 0).replace(/ [+-]\dd$/, '');
}

export default function PeakSlots({ initial }: { initial: PeakSlot[] }) {
    const [slots, setSlots] = useState<PeakSlot[]>(initial);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

    const setTime = (i: number, time: string) => {
        setSlots((s) => s.map((sl, idx) => (idx === i ? { ...sl, time } : sl)));
        setDirty(true);
        setMsg(null);
    };

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/engine/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'savePeakSlots', slots }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) setMsg({ tone: 'warn', text: data?.reason || 'Save failed.' });
            else { setMsg({ tone: 'ok', text: 'Saved' }); setDirty(false); }
        } catch (e: any) {
            setMsg({ tone: 'warn', text: e?.message || 'Network error.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ak-card">
            <div className="flex items-baseline justify-between" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span className="ak-overline" style={{ color: '#3a8be0' }}>Peak time slots</span>
                <div className="ak-syncm">
                    <button className="ak-syncm__btn" onClick={save} disabled={saving || !dirty}>
                        <Save size={13} className={saving ? 'ak-spin' : ''} /> {saving ? 'Saving…' : 'Save'}
                    </button>
                    {msg && (
                        <span className={`ak-syncm__msg ak-syncm__msg--${msg.tone}`}>
                            {msg.tone === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
                            {msg.text}
                        </span>
                    )}
                </div>
            </div>
            <div className="ak-caption" style={{ marginBottom: 12 }}>
                The three windows the engine posts into (all times US Eastern). Edit any time; the audience-local equivalents update live.
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr' }} className="ak-slots-grid">
                {slots.map((sl, i) => (
                    <div key={i} className="ak-uprow" style={{ padding: 12, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                        <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
                            <span style={{ fontFamily: 'var(--ak-display)', fontWeight: 800, color: 'var(--ink)' }}>{sl.label}</span>
                            <span className="ak-caption">{sl.region}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Clock size={15} style={{ color: 'var(--ink-3)' }} />
                            <input
                                type="time"
                                value={sl.time}
                                onChange={(e) => setTime(i, e.target.value)}
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}
                            />
                            <span className="ak-caption" style={{ fontWeight: 700 }}>{etLabel(sl.time)} ET</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                            {ZONES.map((z) => (
                                <span key={z.label} className="ak-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    <strong style={{ color: 'var(--ink-2)' }}>{z.label}</strong> {shift(sl.time, z.offset)}
                                </span>
                            ))}
                        </div>
                        {sl.note && <div className="ak-caption">{sl.note}</div>}
                    </div>
                ))}
            </div>
            <style>{`@media (min-width: 820px){ .ak-slots-grid { grid-template-columns: 1fr 1fr 1fr !important; } }`}</style>
        </div>
    );
}
