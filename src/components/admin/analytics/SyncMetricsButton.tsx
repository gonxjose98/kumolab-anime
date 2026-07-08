'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Check, AlertTriangle } from 'lucide-react';

/**
 * Pulls per-post Instagram metrics into posts.social_metrics on demand, then
 * refreshes the dashboard so the newly-filled numbers show. Backfills in chunks:
 * each click syncs the next batch of posts still missing metrics (plus refreshes
 * recent ones), so a few clicks cover the whole history.
 */
export default function SyncMetricsButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

    const run = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/analytics/sync-metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 100 }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setMsg({ tone: 'warn', text: data?.reason || 'Sync failed. Try again shortly.' });
            } else {
                const bits = [`Synced ${data.synced}`];
                if (data.failed) bits.push(`${data.failed} skipped`);
                if (data.remaining) bits.push(`${data.remaining} left — click again`);
                else bits.push('all caught up');
                setMsg({
                    tone: data.rateLimited ? 'warn' : 'ok',
                    text: data.rateLimited ? `${data.synced} synced, Meta rate-limited — retry in a few min` : bits.join(' · '),
                });
                startTransition(() => router.refresh());
            }
        } catch (e: any) {
            setMsg({ tone: 'warn', text: e?.message || 'Network error.' });
        } finally {
            setBusy(false);
        }
    };

    const working = busy || pending;
    return (
        <div className="ak-syncm">
            <button className="ak-syncm__btn" onClick={run} disabled={working}>
                <RefreshCw size={14} className={working ? 'ak-spin' : ''} />
                {working ? 'Syncing…' : 'Sync social metrics'}
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
