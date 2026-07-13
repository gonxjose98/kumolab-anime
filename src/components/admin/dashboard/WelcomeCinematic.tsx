'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './WelcomeCinematic.module.css';

/* ── Timeline (ms) ───────────────────────────────────────────────
   Full motion:   sunrise bloom → ようこそ → name impact → glint →
                  subtitle → fade out. Leave begins at 4800, the
                  exit fade runs 600, onDone fires at ~5400.
   Reduced:       static card held ~1.6s, then the same exit fade. */
const LEAVE_AT = 4800;
const LEAVE_AT_REDUCED = 1600;
const EXIT_MS = 600;

/* Sea-sparkle motes rising off the water, SeaToSky-style: fixed
   deterministic placements, per-item delay/duration via CSS vars. */
const SPARKLES = [
    { l: 12, s: 5, de: 0.6, du: 3.4 },
    { l: 21, s: 3, de: 1.8, du: 4.2 },
    { l: 30, s: 6, de: 1.1, du: 3.0 },
    { l: 38, s: 4, de: 2.6, du: 4.6 },
    { l: 47, s: 5, de: 0.9, du: 3.6 },
    { l: 55, s: 3, de: 2.1, du: 4.0 },
    { l: 63, s: 6, de: 1.4, du: 3.2 },
    { l: 71, s: 4, de: 2.9, du: 4.4 },
    { l: 80, s: 5, de: 0.7, du: 3.8 },
    { l: 88, s: 3, de: 1.9, du: 4.1 },
];

export default function WelcomeCinematic({ name, onDone }: { name: string; onDone: () => void }) {
    const [leaving, setLeaving] = useState(false);
    const doneRef = useRef(false);
    const onDoneRef = useRef(onDone);
    const timersRef = useRef<number[]>([]);

    /* Keep the latest onDone without re-arming the mount timeline. */
    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    /* Begin the exit fade, then fire onDone exactly once. */
    const leave = useCallback(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        setLeaving(true);
        timersRef.current.push(
            window.setTimeout(() => onDoneRef.current(), EXIT_MS)
        );
    }, []);

    useEffect(() => {
        const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        timersRef.current.push(
            window.setTimeout(leave, reduce ? LEAVE_AT_REDUCED : LEAVE_AT)
        );
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') leave();
        };
        window.addEventListener('keydown', onKey);
        const timers = timersRef.current;
        return () => {
            timers.forEach((t) => window.clearTimeout(t));
            window.removeEventListener('keydown', onKey);
        };
    }, [leave]);

    return (
        <div
            className={`${styles.overlay} ${leaving ? styles.leaving : ''}`}
            role="dialog"
            aria-label={`Welcome, ${name}`}
            onClick={leave}
        >
            {/* ── Backdrop scene: dawn sky, sun bloom, god-rays, sea ── */}
            <div className={styles.scene} aria-hidden="true">
                <div className={styles.rays} />
                <div className={styles.sun} />
                <div className={`${styles.cloud} ${styles.cloudA}`} />
                <div className={`${styles.cloud} ${styles.cloudB}`} />
                <div className={styles.sea} />
                <div className={styles.horizon} />
                <div className={styles.sparkles}>
                    {SPARKLES.map((sp, i) => (
                        <span
                            key={i}
                            className={styles.sparkle}
                            style={
                                {
                                    left: `${sp.l}%`,
                                    width: sp.s,
                                    height: sp.s,
                                    '--de': `${sp.de}s`,
                                    '--du': `${sp.du}s`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>
                <div className={styles.vignette} />
            </div>

            {/* ── Title card ── */}
            <div className={styles.card}>
                <div className={styles.kana} aria-hidden="true">
                    ようこそ
                </div>
                <p className={styles.greeting} aria-live="polite">
                    <span className={styles.hello}>Welcome,</span>
                    <span className={styles.nameWrap}>
                        <span className={styles.ring} aria-hidden="true" />
                        <span className={styles.name}>{name}</span>
                    </span>
                </p>
                <div className={styles.sub}>本部 · KumoLab Command Center</div>
            </div>

            <button
                type="button"
                className={styles.skip}
                onClick={(e) => {
                    e.stopPropagation();
                    leave();
                }}
            >
                Skip →
            </button>
        </div>
    );
}
