'use client';

import { useEffect, useRef, useState } from 'react';

/** IntersectionObserver reveal — fires once, then disconnects. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
    const ref = useRef<T | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        const obs = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    setVisible(true);
                    obs.disconnect();
                }
            },
            { threshold },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);

    return { ref, visible };
}

/** rAF count-up with easeOutExpo — starts when `start` flips true. */
export function useCountUp(end: number, start: boolean, duration = 2000, decimals = 0) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (!start || end === 0) return;
        let raf = 0;
        const t0 = performance.now();
        const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
        const tick = (now: number) => {
            const p = Math.min((now - t0) / duration, 1);
            const v = end * ease(p);
            setValue(decimals > 0 ? parseFloat(v.toFixed(decimals)) : Math.round(v));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [start, end, duration, decimals]);

    return value;
}
