'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import styles from './SkyHome.module.css';

/**
 * Route-scoped day/night wrapper for /redesign-sky.
 *
 * Reads the shared next-themes value (the ☀/🌙 toggle in the global nav)
 * and drives a continuous time-of-day variable `--t` (0 = day, 1 = night)
 * on the page root, tweened with an easeInOut rAF over ~2.1s on every
 * toggle. Every module reads `--t` to cross-fade the sky through dusk,
 * fade the stars in/out, tint the ocean + clouds, and sweep the celestial
 * arc (sun sets one side / moon rises the other). `data-sky` is also
 * stamped for the discrete content-section palette. globals.css is never
 * touched.
 *
 * THEME MAPPING (see report):
 *   next-themes 'dark'  → day   (--t = 0)  ← DEFAULT (bright scene)
 *   next-themes 'light' → night (--t = 1)
 * The site's global `defaultTheme` is "dark", so day is the default first
 * paint; toggling eases to night. Before mount we render day to match SSR
 * (no flash, no hydration mismatch).
 */
export default function SkyThemeRoot({ children }: { children: React.ReactNode }) {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const tRef = useRef(0);
    const rafRef = useRef(0);
    const firstRef = useRef(true);

    useEffect(() => setMounted(true), []);

    const night = mounted && resolvedTheme === 'light';

    /* Route-scoped NAV SKIN — runtime DOM only, no shared files touched.
       While this preview is mounted, stamp `data-sky-nav="day|night"` on
       the global fixed nav (the first <nav> in the document — rendered by
       ConditionalLayout before any page content). Route-scoped :global()
       rules in SkyHome.module.css key off that attribute to restyle the
       nav to match the sky. The attributes are removed on unmount, so
       every other route keeps the untouched galaxy nav. React never
       manages these attributes, so reconciliation won't strip them. */
    useEffect(() => {
        if (!mounted) return;
        const nav = document.querySelector<HTMLElement>('nav');
        if (!nav) return;
        nav.setAttribute('data-sky-nav', night ? 'night' : 'day');
        return () => nav.removeAttribute('data-sky-nav');
    }, [mounted, night]);

    /* Mirror the nav's own show-on-scroll condition (scrollY > 50) into
       `data-sky-scrolled` so the skin CSS can restyle the scrolled chrome
       without depending on hashed CSS-module class names (which differ
       between Turbopack dev and webpack prod builds). */
    useEffect(() => {
        if (!mounted) return;
        const nav = document.querySelector<HTMLElement>('nav');
        if (!nav) return;
        const onScroll = () =>
            nav.setAttribute('data-sky-scrolled', window.scrollY > 50 ? '1' : '0');
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            nav.removeAttribute('data-sky-scrolled');
        };
    }, [mounted]);

    useEffect(() => {
        const el = rootRef.current;
        if (!el || !mounted) return;
        const target = night ? 1 : 0;

        // First resolved paint (or reduced motion): jump, don't animate.
        const reduce =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (firstRef.current || reduce) {
            firstRef.current = false;
            tRef.current = target;
            el.style.setProperty('--t', String(target));
            return;
        }

        const start = tRef.current;
        const t0 = performance.now();
        const dur = 2100;
        const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

        cancelAnimationFrame(rafRef.current);
        const stepFrame = (now: number) => {
            const k = Math.min((now - t0) / dur, 1);
            const v = start + (target - start) * ease(k);
            tRef.current = v;
            el.style.setProperty('--t', v.toFixed(4));
            if (k < 1) rafRef.current = requestAnimationFrame(stepFrame);
        };
        rafRef.current = requestAnimationFrame(stepFrame);
        return () => cancelAnimationFrame(rafRef.current);
    }, [mounted, night]);

    return (
        <div
            ref={rootRef}
            className={styles.page}
            data-sky={night ? 'night' : 'day'}
            style={{ ['--t' as string]: night ? 1 : 0 } as React.CSSProperties}
        >
            {children}
        </div>
    );
}
