'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

/**
 * Inline action cluster for a single pending post on the dashboard:
 *   • Approve — opens a format popup (Vertical reel vs Landscape), then
 *     schedules the post into the next available slot in the chosen format.
 *   • Decline — write a declined fingerprint and remove the row
 *
 * `originalFormat` marks which option is the post's native format:
 *   • 'reel'      → the post is video-sourced (already a vertical clip).
 *   • 'landscape' → a still key-visual (its native format is the landscape image).
 * Picking "Vertical reel" sets image_settings.convertToReel so a still image is
 * Ken-Burns'd into a 1080×1920 Reel and published to IG + FB + Threads;
 * "Landscape" keeps today's behavior (no conversion).
 *
 * All routes are admin-gated.
 */
type Format = 'reel' | 'landscape';

export default function PendingReviewActions({
    postId,
    originalFormat = 'landscape',
}: {
    postId: string;
    originalFormat?: Format;
}) {
    const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [askFormat, setAskFormat] = useState(false);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (!askFormat) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAskFormat(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [askFormat]);

    async function approve(format: Format) {
        setAskFormat(false);
        setBusy('approve');
        setError(null);
        try {
            const res = await fetch('/api/admin/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postIds: [postId], format }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `approve failed (HTTP ${res.status})`);
            }
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Unknown error');
            setBusy(null);
        }
    }

    async function decline() {
        setBusy('decline');
        setError(null);
        try {
            const res = await fetch('/api/admin/decline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postIds: [postId] }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `decline failed (HTTP ${res.status})`);
            }
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Unknown error');
            setBusy(null);
        }
    }

    const orig = (f: Format) => (originalFormat === f ? ' (original)' : '');

    return (
        <div className="flex flex-col gap-1.5 items-end">
            <div className="flex gap-1.5 justify-end">
                <button
                    onClick={() => setAskFormat(true)}
                    disabled={!!busy}
                    className="ak-btn ak-btn--primary ak-btn--xs ak-btn--pill"
                >
                    {busy === 'approve' ? '…' : 'Approve'}
                </button>
                <button
                    onClick={decline}
                    disabled={!!busy}
                    className="ak-btn ak-btn--quiet ak-btn--xs ak-btn--pill"
                >
                    {busy === 'decline' ? '…' : 'Decline'}
                </button>
            </div>
            {error && (
                <span className="ak-caption" style={{ color: 'var(--sun)' }}>
                    {error}
                </span>
            )}

            {askFormat && mounted && createPortal(
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Choose publish format"
                    onClick={() => setAskFormat(false)}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(12,18,28,0.72)', backdropFilter: 'blur(2px)' }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="ak-card w-full"
                        style={{ maxWidth: 420, padding: 0, overflow: 'hidden' }}
                    >
                        <div className="p-4" style={{ borderBottom: '1px solid var(--line)' }}>
                            <span className="ak-heading">Publish as…</span>
                            <p className="ak-caption" style={{ marginTop: 4 }}>
                                Choose the format this post goes out in.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 p-4">
                            <button
                                type="button"
                                onClick={() => approve('reel')}
                                className="ak-card w-full text-left"
                                style={{ padding: '12px 14px', cursor: 'pointer' }}
                            >
                                <span className="ak-heading">Vertical reel{orig('reel')}</span>
                                <p className="ak-caption" style={{ marginTop: 3 }}>
                                    Converts to a 1080×1920 Reel — publishes to Instagram, Facebook &amp; Threads.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => approve('landscape')}
                                className="ak-card w-full text-left"
                                style={{ padding: '12px 14px', cursor: 'pointer' }}
                            >
                                <span className="ak-heading">Landscape{orig('landscape')}</span>
                                <p className="ak-caption" style={{ marginTop: 3 }}>
                                    The usual — no conversion (image key-visuals go to Facebook only).
                                </p>
                            </button>
                        </div>

                        <div className="p-3 text-right" style={{ borderTop: '1px solid var(--line)' }}>
                            <button
                                type="button"
                                onClick={() => setAskFormat(false)}
                                className="ak-btn ak-btn--ghost ak-btn--sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
