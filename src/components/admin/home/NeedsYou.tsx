'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import PendingPreview from '@/components/admin/dashboard/PendingPreview';
import PendingReviewActions from '@/components/admin/dashboard/PendingReviewActions';
import type { TokenAlert } from '@/lib/dashboard/alerts';

export interface PendingLite {
    id: string;
    title: string;
    image: string | null;
    source_url: string | null;
    youtube_video_id: string | null;
}

/**
 * "Needs you": one yellow strip per thing that needs Jose, or one green
 * "All clear" line. Pending posts open a compact approve/decline sheet;
 * token strips expand to the fix; orders go to the Orders board.
 */
export default function NeedsYou({ tokens, pending, pendingTotal, ordersAwaiting }: {
    tokens: TokenAlert[];
    pending: PendingLite[];
    pendingTotal: number;
    ordersAwaiting: number;
}) {
    const [sheet, setSheet] = useState(false);
    const [openToken, setOpenToken] = useState<string | null>(null);
    // The sheet only opens from a click, so it never renders on the server.
    // It closes itself once the last pending post is handled (router.refresh empties the list).
    const sheetOpen = sheet && pending.length > 0;
    useEffect(() => {
        if (!sheetOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [sheetOpen]);

    const nothing = tokens.length === 0 && pendingTotal === 0 && ordersAwaiting === 0;
    if (nothing) {
        return (
            <div className="ak-home-need ak-home-need--ok" role="status">
                <i className="ak-home-need__dot" aria-hidden="true" />
                <p>All clear. Nothing needs you right now.</p>
            </div>
        );
    }

    return (
        <div className="ak-home-needs">
            {tokens.map((t) => (
                <div key={t.key} className={`ak-home-need ${t.level === 'crit' ? 'ak-home-need--crit' : ''}`}>
                    <button className="ak-home-need__row" onClick={() => setOpenToken((k) => (k === t.key ? null : t.key))} aria-expanded={openToken === t.key}>
                        <i className="ak-home-need__dot" aria-hidden="true" />
                        <p>{t.text}</p>
                        <span>{openToken === t.key ? 'Hide' : 'Fix ›'}</span>
                    </button>
                    {openToken === t.key && <div className="ak-home-need__detail">{t.detail}</div>}
                </div>
            ))}

            {pendingTotal > 0 && (
                <div className="ak-home-need">
                    <button className="ak-home-need__row" onClick={() => setSheet(true)}>
                        <i className="ak-home-need__dot" aria-hidden="true" />
                        <p>{pendingTotal} {pendingTotal === 1 ? 'post' : 'posts'} waiting for approval</p>
                        <span>Review ›</span>
                    </button>
                </div>
            )}

            {ordersAwaiting > 0 && (
                <div className="ak-home-need">
                    <Link href="/admin/store/orders" className="ak-home-need__row">
                        <i className="ak-home-need__dot" aria-hidden="true" />
                        <p>{ordersAwaiting} paid {ordersAwaiting === 1 ? 'order' : 'orders'} waiting for approval</p>
                        <span>Review ›</span>
                    </Link>
                </div>
            )}

            {sheetOpen && createPortal(
                // z-index 40: PendingReviewActions' format popup portals at z-50 and must sit above this sheet.
                <div className="admin-root ak-home-sheet__wrap" onClick={() => setSheet(false)}>
                    <div className="ak-home-sheet" role="dialog" aria-modal="true" aria-label="Posts waiting for approval" onClick={(e) => e.stopPropagation()}>
                        <div className="ak-home-sheet__head">
                            <span className="ak-heading">Waiting for approval</span>
                            <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => setSheet(false)}>Close</button>
                        </div>
                        <ul className="ak-home-sheet__list">
                            {pending.map((p) => (
                                <li key={p.id} className="ak-home-sheet__item">
                                    <PendingPreview image={p.image} youtubeId={p.youtube_video_id} sourceUrl={p.source_url} title={p.title} />
                                    <Link href={`/admin/post/${p.id}`} className="ak-home-sheet__title">{p.title}</Link>
                                    <div className="ak-home-sheet__actions">
                                        <PendingReviewActions
                                            postId={p.id}
                                            originalFormat={(p.youtube_video_id || /youtube\.com|youtu\.be/.test(p.source_url || '')) ? 'reel' : 'landscape'}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {pendingTotal > pending.length && (
                            <Link href="/admin/content/posts" className="ak-home-sheet__more">See all {pendingTotal} pending</Link>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
