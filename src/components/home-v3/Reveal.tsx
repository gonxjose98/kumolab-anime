'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Home v3 page behaviour, mounted once per page:
 *  1. Scroll reveal: anything marked `data-reveal` starts hidden and rises in
 *     when it enters the viewport (stagger via `data-reveal-i`). Hiding only
 *     kicks in once this runs (`hv3-reveal` on <html>), so without JS
 *     everything is visible.
 *  2. Page transitions: internal link clicks fade the page out into the sky,
 *     then navigate; the next page fades in (CSS on `.page`).
 */
export default function Reveal() {
    const router = useRouter();

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('hv3-leaving');
        // Count pages seen in this tab so Back knows there is somewhere to go back to.
        try { sessionStorage.setItem('hv3-pages', String(Number(sessionStorage.getItem('hv3-pages') || 0) + 1)); } catch { /* storage blocked */ }
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        // ── Page transitions ──
        const onClick = (ev: MouseEvent) => {
            if (reduce || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
            const a = (ev.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null;
            if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
            const url = new URL(a.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            // Same-page anchors (#drops, #forecast) scroll normally.
            if (url.pathname === window.location.pathname && url.hash) return;
            ev.preventDefault();
            root.classList.add('hv3-leaving');
            window.setTimeout(() => router.push(url.pathname + url.search + url.hash), 280);
        };
        document.addEventListener('click', onClick, true);

        if (reduce) return () => document.removeEventListener('click', onClick, true);

        // ── Scroll reveal ──
        root.classList.add('hv3-reveal');
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
        els.forEach((el) => {
            const i = Number(el.dataset.revealI || 0);
            el.style.setProperty('--d', `${Math.min(i, 8) * 90}ms`);
        });
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        const el = e.target as HTMLElement;
                        el.classList.add('is-in');
                        io.unobserve(el);
                        // Once it has risen in, hand the element back to its own styles.
                        const delay = parseInt(el.style.getPropertyValue('--d') || '0', 10) || 0;
                        window.setTimeout(() => {
                            el.removeAttribute('data-reveal');
                            el.classList.remove('is-in');
                        }, delay + 950);
                    }
                }
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
        );
        els.forEach((el) => io.observe(el));
        return () => {
            document.removeEventListener('click', onClick, true);
            io.disconnect();
            root.classList.remove('hv3-reveal');
        };
    }, [router]);
    return null;
}
