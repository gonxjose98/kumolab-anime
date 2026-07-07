'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import styles from './motion.module.css';

/** IntersectionObserver visibility hook (fires once). */
export function useInView<T extends HTMLElement>(threshold = 0.15) {
    const ref = useRef<T>(null);
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
            { threshold }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);

    return { ref, visible };
}

/** Eased count-up that begins when `start` flips true. Respects reduced motion. */
export function useCountUp(end: number, start: boolean, duration = 2000) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (!start) return;
        if (
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
            setValue(end);
            return;
        }
        let raf = 0;
        const t0 = performance.now();
        const tick = (t: number) => {
            const p = Math.min((t - t0) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
            setValue(end * eased);
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [end, start, duration]);

    return value;
}

/** Scroll-reveal wrapper — fades + rises when it enters the viewport. */
export function Reveal({
    children,
    delay = 0,
    className = '',
}: {
    children: ReactNode;
    delay?: number;
    className?: string;
}) {
    const { ref, visible } = useInView<HTMLDivElement>(0.12);
    return (
        <div
            ref={ref}
            className={`${styles.reveal} ${visible ? styles.visible : ''} ${className}`}
            style={{ '--rv-delay': `${delay}s` } as React.CSSProperties}
        >
            {children}
        </div>
    );
}
