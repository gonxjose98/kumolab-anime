'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Clickable review thumbnail + watch modal for a pending candidate.
 *
 * The pipeline doesn't stage the actual video until publish, so at review time
 * a candidate only carries a still image plus EITHER a `youtubeId` (YouTube-
 * sourced) or a `sourceUrl` (article-sourced: ANN / Crunchyroll). This lets the
 * operator WATCH before judging, right on the dashboard:
 *   • youtubeId present → inline YouTube player (nocookie, click-to-load).
 *   • otherwise         → the still image + a prominent "Watch at source ↗".
 *
 * The 48px thumb mirrors the old <Thumbnail>: post image if real, else the
 * YouTube thumbnail, else a dash tile. A ▸ badge signals it's watchable.
 */
export default function PendingPreview({
    image,
    youtubeId,
    sourceUrl,
    title,
}: {
    image?: string | null;
    youtubeId?: string | null;
    sourceUrl?: string | null;
    title: string;
}) {
    const [open, setOpen] = useState(false);
    // Portal target only exists on the client; gate the portal on mount so
    // SSR/first paint never touches document.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const thumbUrl =
        image && !image.includes('placeholder')
            ? image
            : youtubeId
                ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
                : null;

    // Something to watch = a video to embed OR a source to open.
    const watchable = !!youtubeId || !!sourceUrl;

    // Close on Escape while the modal is open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <>
            <button
                type="button"
                onClick={() => watchable && setOpen(true)}
                disabled={!watchable}
                aria-label={watchable ? `Preview "${title}"` : title}
                className="relative w-12 h-12 rounded-lg shrink-0 overflow-hidden group"
                style={{
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                    cursor: watchable ? 'pointer' : 'default',
                }}
            >
                {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="ak-caption flex items-center justify-center w-full h-full">—</span>
                )}
                {watchable && (
                    <span
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.28)' }}
                    >
                        <span
                            className="flex items-center justify-center rounded-full"
                            style={{ width: 22, height: 22, background: 'rgba(0,0,0,0.6)' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 10 12" fill="#fff" aria-hidden="true">
                                <path d="M0 0l10 6-10 6z" />
                            </svg>
                        </span>
                    </span>
                )}
            </button>

            {open && mounted && createPortal(
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Preview: ${title}`}
                    onClick={() => setOpen(false)}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(12,18,28,0.72)', backdropFilter: 'blur(2px)' }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="ak-card w-full"
                        style={{ maxWidth: 720, padding: 0, overflow: 'hidden' }}
                    >
                        <div className="flex items-center justify-between gap-3 p-4" style={{ borderBottom: '1px solid var(--line)' }}>
                            <span className="ak-heading truncate">{title}</span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close preview"
                                className="ak-btn ak-btn--ghost ak-btn--sm shrink-0"
                            >
                                Close
                            </button>
                        </div>

                        {youtubeId ? (
                            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
                                <iframe
                                    src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
                                    title={title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 p-5">
                                {thumbUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={thumbUrl}
                                        alt=""
                                        className="w-full rounded-lg"
                                        style={{ maxHeight: 360, objectFit: 'contain', background: 'var(--surface-2)' }}
                                    />
                                )}
                                <p className="ak-caption text-center" style={{ maxWidth: 440 }}>
                                    This candidate came from an article, so the trailer isn&apos;t embeddable here. Open the
                                    source to watch it, then come back to Approve or Decline.
                                </p>
                                {sourceUrl && (
                                    <a
                                        href={sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ak-btn ak-btn--primary"
                                    >
                                        Watch at source ↗
                                    </a>
                                )}
                            </div>
                        )}

                        {youtubeId && sourceUrl && (
                            <div className="p-3 text-center" style={{ borderTop: '1px solid var(--line)' }}>
                                <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ak-caption"
                                    style={{ color: 'var(--gold-text)', textDecoration: 'none' }}
                                >
                                    Open source article ↗
                                </a>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
