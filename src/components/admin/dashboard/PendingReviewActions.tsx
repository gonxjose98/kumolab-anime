'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Inline approve/decline buttons for a single pending post on the dashboard.
 * Approve schedules the post into the next available slot; decline writes a
 * declined fingerprint and removes the row. Both routes are admin-gated.
 */
export default function PendingReviewActions({ postId }: { postId: string }) {
    const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function call(path: string, label: 'approve' | 'decline') {
        setBusy(label);
        setError(null);
        try {
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postIds: [postId] }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `${label} failed (HTTP ${res.status})`);
            }
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Unknown error');
            setBusy(null);
        }
    }

    return (
        <div className="flex flex-col gap-1.5 items-end">
            <div className="flex gap-2">
                <button
                    onClick={() => call('/api/admin/approve', 'approve')}
                    disabled={!!busy}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                        background: 'linear-gradient(135deg, rgba(0,255,136,0.18), rgba(0,212,170,0.10))',
                        border: '1px solid rgba(0,255,136,0.35)',
                        color: '#7af0a8',
                        fontFamily: 'var(--font-display)',
                    }}
                >
                    {busy === 'approve' ? '…' : 'Approve'}
                </button>
                <button
                    onClick={() => call('/api/admin/decline', 'decline')}
                    disabled={!!busy}
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-display)',
                    }}
                >
                    {busy === 'decline' ? '…' : 'Decline'}
                </button>
            </div>
            {error && (
                <span className="text-[9px]" style={{ color: '#ff7777' }}>
                    {error}
                </span>
            )}
        </div>
    );
}
