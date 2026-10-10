'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Play, X } from 'lucide-react';
import type { ScheduleRow } from '@/lib/schedule';
import { KindIcon, PLATFORM_LABEL, kindLabel } from './scheduleUi';

/*
 * Read-only preview of a scheduled post: the carousel exactly as it will ship
 * (the baked 1080x1350 slide JPEGs), plus its captions.
 *
 * Swiping is native CSS scroll-snap on an overflow-x track: the browser owns
 * the gesture on the compositor, so it stays at 60fps on iPhone Safari with no
 * JS on the touch path. JS only reads scrollLeft (rAF-throttled) to update the
 * counter/dots, and drives scrollTo for the arrow buttons and keyboard.
 *
 * No in-place edit link: opening a live carousel in the editor has auto-saved
 * and corrupted posts before. The Content tab passes `actions` (Download, and a
 * Studio button that opens an editable COPY of live posts).
 */

const ET = 'America/New_York';

function whenLabel(iso: string): string {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }).format(d);
    return `${day} · ${time} ET`;
}

function relLabel(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(ms);
    const mins = Math.round(abs / 60_000);
    const hrs = Math.round(abs / 3_600_000);
    const days = Math.round(abs / 86_400_000);
    const span = mins < 60 ? `${mins} min` : hrs < 36 ? `${hrs} hr` : `${days} days`;
    return ms >= 0 ? `in ${span}` : `${span} ago`;
}

export default function SchedulePreview({ row, onClose, actions }: { row: ScheduleRow; onClose: () => void; actions?: React.ReactNode }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const [idx, setIdx] = useState(0);
    const idxRef = useRef(0);
    // Slides that have been in range once stay eager, so swiping back never
    // re-fetches or flashes.
    const [seen, setSeen] = useState(() => new Set([0, 1]));
    const slides = row.slides;
    const n = slides.length;
    const isCarousel = row.kind === 'carousel';

    // Body scroll lock (iOS-safe: pin the body with position:fixed so the page
    // behind can't rubber-band), focus the close button, restore on close.
    useEffect(() => {
        const prevFocus = document.activeElement as HTMLElement | null;
        const y = window.scrollY;
        const b = document.body.style;
        const prev = { position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow };
        b.position = 'fixed'; b.top = `-${y}px`; b.left = '0'; b.right = '0'; b.overflow = 'hidden';
        closeRef.current?.focus({ preventScroll: true });
        return () => {
            Object.assign(b, prev);
            window.scrollTo(0, y);
            prevFocus?.focus?.({ preventScroll: true });
        };
    }, []);

    const go = useCallback((i: number) => {
        const el = trackRef.current;
        if (!el) return;
        const clamped = Math.max(0, Math.min(n - 1, i));
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ left: clamped * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    }, [n]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); go(idxRef.current + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idxRef.current - 1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, onClose]);

    // rAF-throttled position read; state only changes when the slide changes.
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                if (i !== idxRef.current) {
                    idxRef.current = i;
                    setIdx(i);
                    setSeen((s) => (s.has(i + 1) && s.has(i - 1) ? s : new Set([...s, i - 1, i, i + 1])));
                }
            });
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
    }, []);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="admin-root">
            <div className="ak-pv__scrim" onClick={onClose}>
                <div className="ak-pv" role="dialog" aria-modal="true" aria-label={`Preview: ${row.title}`} onClick={(e) => e.stopPropagation()}>
                    <div className="ak-pv__bar">
                        <span className="ak-pv__kind"><KindIcon kind={row.kind} size={13} />{kindLabel(row)}</span>
                        {n > 1 && <span className="ak-pv__counter" aria-live="polite">{idx + 1} / {n}</span>}
                        <button ref={closeRef} type="button" className="ak-pv__close" onClick={onClose} aria-label="Close preview">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="ak-pv__stage">
                        <div className={`ak-pv__frame ${isCarousel ? '' : 'ak-pv__frame--contain'} ${row.videoUrl ? 'ak-pv__frame--reel' : ''}`}>
                            {row.videoUrl ? (
                                // Reels: play the exact MP4 that publishes, starting muted like IG.
                                <video className="ak-pv__video" src={row.videoUrl} poster={row.cover ?? undefined}
                                    controls playsInline autoPlay muted loop preload="metadata" />
                            ) : n === 0 ? (
                                <div className="ak-pv__noimg"><KindIcon kind={row.kind} size={28} /><span>No image yet</span></div>
                            ) : (
                                <div ref={trackRef} className="ak-pv__track" tabIndex={-1}>
                                    {slides.map((src, i) => (
                                        <div key={src + i} className="ak-pv__slide" aria-roledescription="slide" aria-label={`${i + 1} of ${n}`}>
                                            {/* Plain <img>: the exact JPEG that publishes, no optimizer hop mid-swipe. */}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={src}
                                                alt={isCarousel ? `Slide ${i + 1}` : row.title}
                                                width={1080}
                                                height={1350}
                                                loading={seen.has(i) ? 'eager' : 'lazy'}
                                                decoding="async"
                                                draggable={false}
                                                fetchPriority={i === 0 ? 'high' : 'auto'}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {row.kind === 'video' && !row.videoUrl && row.youtubeUrl && (
                                <a className="ak-pv__play" href={row.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch video on YouTube">
                                    <Play size={22} fill="currentColor" />
                                </a>
                            )}
                            {!row.videoUrl && n > 1 && (
                                <>
                                    <button type="button" className="ak-pv__arrow ak-pv__arrow--prev" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous slide">
                                        <ChevronLeft size={20} />
                                    </button>
                                    <button type="button" className="ak-pv__arrow ak-pv__arrow--next" onClick={() => go(idx + 1)} disabled={idx >= n - 1} aria-label="Next slide">
                                        <ChevronRight size={20} />
                                    </button>
                                </>
                            )}
                        </div>
                        {n > 1 && (
                            <div className="ak-pv__dots" aria-hidden="true">
                                {slides.map((_, i) => (
                                    <span key={i} className={`ak-pv__dot ${i === idx ? 'ak-pv__dot--on' : ''}`} onClick={() => go(i)} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="ak-pv__info">
                        <h2 className="ak-pv__title">{row.title}</h2>
                        {actions && <div className="ak-pv__actions">{actions}</div>}
                        <div className="ak-pv__when">
                            <strong>{whenLabel(row.scheduledPostTime)}</strong>
                            <span>{row.status === 'published' ? 'Posted' : 'Scheduled'} {relLabel(row.scheduledPostTime)}</span>
                        </div>
                        <div className="ak-pv__plats">
                            {row.platforms.map((p) => <span key={p} className={`ak-plat ak-plat--${p}`}>{PLATFORM_LABEL[p]}</span>)}
                        </div>

                        <div className="ak-pv__caption">
                            <div className="ak-pv__caplbl">{row.captionIsExcerpt ? 'Website excerpt' : 'Instagram caption'}</div>
                            {row.caption
                                ? <p className="ak-pv__captext">{row.caption}</p>
                                : <p className="ak-pv__captext ak-pv__captext--none">No caption set.</p>}
                        </div>

                        {row.fbCaption && row.fbCaption !== row.caption && (
                            <details className="ak-pv__more">
                                <summary>Facebook caption <ChevronDown size={14} /></summary>
                                <p className="ak-pv__captext">{row.fbCaption}</p>
                            </details>
                        )}
                        {row.threadsCaption && row.threadsCaption !== row.caption && (
                            <details className="ak-pv__more">
                                <summary>Threads caption <ChevronDown size={14} /></summary>
                                <p className="ak-pv__captext">{row.threadsCaption}</p>
                            </details>
                        )}

                        {row.kind === 'video' && row.youtubeUrl && (
                            <a className="ak-pv__link" href={row.youtubeUrl} target="_blank" rel="noopener noreferrer">
                                Watch on YouTube <ExternalLink size={13} />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
