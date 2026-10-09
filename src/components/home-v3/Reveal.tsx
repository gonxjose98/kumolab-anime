'use client';

import { useEffect } from 'react';

/**
 * Scroll reveal for the home page. Anything marked `data-reveal` starts hidden
 * and rises in when it enters the viewport; siblings use `--d` (set via the
 * `data-reveal-i` index) for a gentle stagger. Hiding only kicks in once this
 * runs (the `hv3-reveal` class on <html>), so without JS everything is visible.
 */
export default function Reveal() {
    useEffect(() => {
        const root = document.documentElement;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
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
                        e.target.classList.add('is-in');
                        io.unobserve(e.target);
                    }
                }
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
        );
        els.forEach((el) => io.observe(el));
        return () => {
            io.disconnect();
            root.classList.remove('hv3-reveal');
        };
    }, []);
    return null;
}
