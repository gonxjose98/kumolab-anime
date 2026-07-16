'use client';

import { useState } from 'react';
import { Camera, Check, AlertTriangle } from 'lucide-react';

/**
 * "Snapshot now" — captures the previous full month into monthly_metrics on
 * demand (same capture the monthly cron runs on the 1st). Useful right after
 * wiring a new source, or to refresh a month's row before its Meta account
 * insights age out of the ~30-day retention window. UPSERTs on month, so
 * clicking twice just refreshes the same row.
 */
export default function SnapshotButton() {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

    const run = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/analytics/snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}), // default: previous full month
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setMsg({ tone: 'warn', text: data?.reason || 'Snapshot failed. Try again shortly.' });
            } else {
                setMsg({ tone: 'ok', text: `Captured ${String(data.month).slice(0, 7)}` });
            }
        } catch (e: any) {
            setMsg({ tone: 'warn', text: e?.message || 'Network error.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ak-syncm">
            <button className="ak-syncm__btn" onClick={run} disabled={busy}>
                <Camera size={14} className={busy ? 'ak-spin' : ''} />
                {busy ? 'Capturing…' : 'Snapshot now'}
            </button>
            {msg && (
                <span className={`ak-syncm__msg ak-syncm__msg--${msg.tone}`}>
                    {msg.tone === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
                    {msg.text}
                </span>
            )}
        </div>
    );
}
