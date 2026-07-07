'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import styles from './SkyContent.module.css';
import ScrollUnlock from './ScrollUnlock';
import SkyContentBackdrop from './SkyContentBackdrop';
import SkyWeather from '@/components/sky-weather';

/**
 * Reusable day/night wrapper for CONTENT pages on the sky theme (blog,
 * merch, about, legal). Wrap a page's content in <SkyContentRoot> and it
 * gets: the opaque calm-sky backdrop (day ↔ night), the sky palette
 * tokens, the route-scoped nav re-skin, and normal document scrolling.
 *
 * Same mechanism as the landing preview's SkyThemeRoot: reads the shared
 * next-themes value (the ☀/🌙 toggle in the global nav) and drives a
 * continuous time-of-day variable `--t` (0 = day, 1 = night) on the page
 * root, tweened with an easeInOut rAF over ~2.1s on every toggle. The
 * backdrop layers cross-fade via `--t`; `data-sky` is also stamped for
 * discrete palette switches. globals.css is never touched.
 *
 * THEME MAPPING (matches /redesign-sky):
 *   next-themes 'dark'  → day   (--t = 0)  ← DEFAULT (bright scene)
 *   next-themes 'light' → night (--t = 1)
 * Before mount we render day to match SSR (no flash, no hydration
 * mismatch).
 */
export default function SkyContentRoot({ children }: { children: React.ReactNode }) {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const tRef = useRef(0);
    const rafRef = useRef(0);
    const firstRef = useRef(true);

    useEffect(() => setMounted(true), []);

    const night = mounted && resolvedTheme === 'light';

    /* Route-scoped NAV SKIN — runtime DOM only, no shared files touched.
       While a content-sky page is mounted, stamp `data-sky-nav="day|night"`
       on the global fixed nav (the first <nav> in the document — rendered
       by ConditionalLayout before any page content). Route-scoped
       :global() rules in SkyContent.module.css key off that attribute to
       restyle the nav to match the sky. The attributes are removed on
       unmount, so every other route keeps the untouched galaxy nav. React
       never manages these attributes, so reconciliation won't strip them. */
    useEffect(() => {
        if (!mounted) return;
        const nav = document.querySelector<HTMLElement>('nav');
        if (!nav) return;
        nav.setAttribute('data-sky-nav', night ? 'night' : 'day');
        return () => nav.removeAttribute('data-sky-nav');
    }, [mounted, night]);

    /* Hide the GLOBAL galaxy footer while a sky page is mounted. The shared
       layout appends its own <footer> after the page slot; our sky pages
       render their own themed <SkyFooter> inside the content, so without this
       the page would end in two stacked footers. Same runtime-DOM approach as
       the nav skin: hide only footers that live OUTSIDE our root, restore them
       on unmount. globals.css / layout are never touched. */
    useEffect(() => {
        if (!mounted) return;
        const root = rootRef.current;
        if (!root) return;
        const externals = Array.from(
            document.querySelectorAll<HTMLElement>('footer')
        ).filter((f) => !root.contains(f));
        const prev = externals.map((f) => f.style.display);
        externals.forEach((f) => {
            f.style.display = 'none';
        });
        return () => {
            externals.forEach((f, i) => {
                f.style.display = prev[i];
            });
        };
    }, [mounted]);

    /* Mirror the nav's own show-on-scroll condition (scrollY > 50) into
       `data-sky-scrolled` so the skin CSS can restyle the scrolled chrome
       without depending on hashed CSS-module class names. */
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
            <ScrollUnlock />
            <SkyContentBackdrop />
            {/* Ambient weather overlay: fixed z-1 — above the backdrop (z-0),
                below .content (z-1, later in the DOM), inherits --t. */}
            <SkyWeather />
            <div className={styles.content}>{children}</div>
        </div>
    );
}
