'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Inline action cluster for a single pending post on the dashboard:
 *   • Approve — schedule the post into the next available slot
 *   • Decline — write a declined fingerprint and remove the row
 *
 * Find Video used to sit here too; it now lives inside the score-breakdown
 * popup (see PendingScoreChip) to keep the rows uncluttered.
 *
 * All routes are admin-gated.
 */
export default function PendingReviewActions({
    postId,
}: {
    postId: string;
}) {
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
        <div className="flex flex-col gap-1.5 items-stretch sm:items-end">
            {/* Full-width, evenly-split on phones; natural-size, right-aligned on desktop. */}
            <div className="flex gap-2 justify-stretch sm:justify-end">
                <button
                    onClick={() => call('/api/admin/approve', 'approve')}
                    disabled={!!busy}
                    className="ak-btn ak-btn--primary ak-btn--sm flex-1 sm:flex-none justify-center"
                >
                    {busy === 'approve' ? '…' : 'Approve'}
                </button>
                <button
                    onClick={() => call('/api/admin/decline', 'decline')}
                    disabled={!!busy}
                    className="ak-btn ak-btn--ghost ak-btn--sm flex-1 sm:flex-none justify-center"
                >
                    {busy === 'decline' ? '…' : 'Decline'}
                </button>
            </div>
            {error && (
                <span className="ak-caption" style={{ color: 'var(--sun)' }}>
                    {error}
                </span>
            )}
        </div>
    );
}
