'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/** Manual refresh. The server enforces the real limits; this only mirrors them. */
export default function RegenerateButton({ hasKey, enabled, allowed, reason, nextAt }: {
    hasKey: boolean; enabled: boolean; allowed: boolean; reason: string | null; nextAt: string | null;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    if (!hasKey || !enabled) return null;

    const lockedText = !allowed ? (nextAt ? `Next refresh at ${fmt(nextAt)}` : reason || 'Locked') : null;

    async function run() {
        setBusy(true);
        setMsg(null);
        const res = await fetch('/api/admin/explore/regenerate', { method: 'POST' }).catch(() => null);
        const body = await res?.json().catch(() => null);
        setBusy(false);
        if (!res?.ok) {
            setMsg(body?.nextAt ? `Next refresh at ${fmt(body.nextAt)}` : body?.error || body?.reason || 'Refresh failed');
            return;
        }
        router.refresh();
    }

    return (
        <div className="ak-xp-regen">
            <button type="button" className="ak-btn ak-btn--secondary ak-btn--sm" onClick={run} disabled={busy || !allowed}>
                <RefreshCw size={14} className={busy ? 'ak-xp-spin' : undefined} aria-hidden="true" />
                {busy ? 'Reading' : 'Refresh'}
            </button>
            {(msg || lockedText) && <span className="ak-caption">{msg || lockedText}</span>}
        </div>
    );
}
