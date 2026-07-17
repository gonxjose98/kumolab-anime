'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, CalendarClock } from 'lucide-react';
import type { ScheduledItem, PeakSlot } from '@/lib/engine/engine-config';

/**
 * Live, read-only mirror of what Content → Schedule has queued. Changes nothing
 * there; just surfaces the upcoming approved posts inside the Engine view, each
 * tagged with the peak slot it lands nearest. Refreshes on mount, every 60s,
 * and on demand.
 */

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer', NEW_KEY_VISUAL: 'Key Visual', NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date', DELAY: 'Delay', CAST_ADDITION: 'Cast', STAFF_UPDATE: 'Staff', OTHER: 'News',
};

/** ET minutes-of-day for an ISO timestamp. */
function etMinutes(iso: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return h * 60 + m;
}

function slotMinutes(hhmm: string): number {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

/** Nearest peak slot to a scheduled time (circular distance over 24h). */
function nearestSlot(iso: string, slots: PeakSlot[]): PeakSlot | null {
    if (!slots.length) return null;
    const mins = etMinutes(iso);
    let best: PeakSlot | null = null;
    let bestD = Infinity;
    for (const s of slots) {
        const d0 = Math.abs(mins - slotMinutes(s.time));
        const d = Math.min(d0, 1440 - d0);
        if (d < bestD) { bestD = d; best = s; }
    }
    return best;
}

function fmtET(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
    });
}

export default function ScheduledFeed({ initial, slots }: { initial: ScheduledItem[]; slots: PeakSlot[] }) {
    const [queue, setQueue] = useState<ScheduledItem[]>(initial);
    const [loading, setLoading] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/engine/config', { cache: 'no-store' });
            const data = await res.json();
            if (data?.queue) setQueue(data.queue);
        } catch {
            // keep prior queue on failure
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setInterval(refresh, 60_000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="ak-card ak-card--flush">
            <div className="flex items-center justify-between" style={{ gap: 8, padding: '16px 18px 10px' }}>
                <div>
                    <span className="ak-overline" style={{ color: '#35a877' }}>Scheduled · live</span>
                    <div className="ak-caption" style={{ marginTop: 2 }}>Mirrors Content → Schedule. Read-only.</div>
                </div>
                <button className="ak-syncm__btn" onClick={refresh} disabled={loading}>
                    <RefreshCw size={13} className={loading ? 'ak-spin' : ''} /> Refresh
                </button>
            </div>
            {queue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 18px' }}>
                    <CalendarClock size={20} style={{ color: 'var(--ink-3)', marginBottom: 8 }} />
                    <div className="ak-caption">Nothing scheduled ahead right now.</div>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="ak-table">
                        <thead>
                            <tr>
                                <th style={{ width: 110 }}>When (ET)</th>
                                <th style={{ width: 90 }}>Slot</th>
                                <th>Post</th>
                                <th style={{ width: 90 }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {queue.map((item) => {
                                const slot = nearestSlot(item.scheduled_post_time, slots);
                                return (
                                    <tr key={item.id}>
                                        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {fmtET(item.scheduled_post_time)}
                                        </td>
                                        <td>
                                            <span className="ak-caption" style={{ color: slot ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                                                {slot ? slot.label : '—'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="ak-body-sm" style={{ color: 'var(--ink)' }}>{item.title}</span>
                                        </td>
                                        <td>
                                            <span className="ak-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                {item.claim_type ? (CLAIM_LABEL[item.claim_type] || 'News') : '—'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
