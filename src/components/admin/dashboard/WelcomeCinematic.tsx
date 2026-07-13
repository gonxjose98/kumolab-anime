'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './WelcomeCinematic.module.css';

/* ── Timeline (ms) ───────────────────────────────────────────────
   Full motion:   sunrise seascape — a straw-hat voyager silhouette
                  on a small boat, arm raised, hat held to the sky →
                  slow camera push on the hat → zoom THROUGH the hat
                  (warm bloom) → match-cut to open dawn sky → iris
                  ring → ようこそ → name impact → glint → subtitle →
                  fade out. Leave begins at 6300, the exit fade runs
                  650, onDone fires at ~6950.
   Reduced:       static key frame (silhouette + raised hat over the
                  sunrise with the greeting) held ~1.6s, same fade. */
const LEAVE_AT = 6300;
const LEAVE_AT_REDUCED = 1600;
const EXIT_MS = 650;

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

/* Rolling cel wave band: a periodic crest spline (period = 25% of the
   200%-wide strip) with a bright foam rim leading the body — drifting
   it by exactly -25% loops seamlessly. */
const WAVE_BODY =
    'M0,62 Q75,30 150,62 T300,62 T450,62 T600,62 T750,62 T900,62 T1050,62 T1200,62 L1200,120 L0,120 Z';
const WAVE_RIM =
    'M0,54 Q75,22 150,54 T300,54 T450,54 T600,54 T750,54 T900,54 T1050,54 T1200,54 L1200,120 L0,120 Z';

function WaveStrip({ className, foam, body }: { className: string; foam: string; body: string }) {
    return (
        <div className={className}>
            <svg
                className={styles.waveSvg}
                viewBox="0 0 1200 120"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path d={WAVE_RIM} fill={foam} />
                <path d={WAVE_BODY} fill={body} />
            </svg>
        </div>
    );
}

/* ── The voyager ─────────────────────────────────────────────────
   An ORIGINAL backlit silhouette: a young adventurer standing on a
   small boat, one arm raised, holding a woven straw hat up to the
   dawn. Pure inline SVG — the hat is the hero prop (rounded crown,
   wide brim, hat-band, weave arcs, a dawn rim-light). The camera
   zoom is anchored on the hat crown (y≈36 in this 200×260 viewBox;
   waterline y≈218 — the module.css anchor math depends on these). */
function StrawHatVoyager({ className }: { className?: string }) {
    const ink = '#0d1b2e';
    return (
        <svg className={className} viewBox="0 0 200 260" aria-hidden="true">
            {/* small boat — hull, raised prow and stern */}
            <path
                d="M28,204 L172,204 C170,215 158,226 136,230 L64,230 C42,226 30,215 28,204 Z"
                fill={ink}
            />
            <path d="M170,205 C180,200 186,192 188,182 C181,190 172,198 164,204 Z" fill={ink} />
            <path d="M30,205 C22,201 17,195 15,187 C21,194 28,200 36,204 Z" fill={ink} />
            {/* sunlit gunwale rim */}
            <path
                d="M34,204 L166,204"
                stroke="#f3c169"
                strokeWidth="2.4"
                strokeLinecap="round"
                opacity="0.55"
                fill="none"
            />
            {/* legs — steady stance on the deck */}
            <path d="M85,166 L79,204 L90,204 L94,170 Z" fill={ink} />
            <path d="M99,170 L102,204 L113,204 L108,166 Z" fill={ink} />
            {/* torso — wind-caught shirt */}
            <path
                d="M84,121 C79,138 77,152 80,167 L112,167 C114,152 112,137 107,121 C99,126 90,126 84,121 Z"
                fill={ink}
            />
            {/* cloth streaming in the dawn wind */}
            <path
                d="M86,126 C74,128 64,126 52,118 C60,130 72,135 87,133 Z"
                fill={ink}
                opacity="0.92"
            />
            {/* head + tousled hair */}
            <circle cx="95" cy="112" r="10.5" fill={ink} />
            <path d="M87,106 L81,99 L90,103 Z" fill={ink} />
            <path d="M93,103 L92,96 L98,102 Z" fill={ink} />
            <path d="M101,104 L107,98 L103,106 Z" fill={ink} />
            {/* raised arm reaching for the sky */}
            <path
                d="M96,122 C98,104 102,84 108,64 L118,66 C113,84 108,104 107,122 Z"
                fill={ink}
            />
            {/* fist gripping the brim */}
            <circle cx="113" cy="60" r="6.4" fill={ink} />
            {/* ── the straw hat, held aloft ── */}
            <ellipse cx="100" cy="48" rx="46" ry="12" fill="#8f6b33" />
            <ellipse cx="100" cy="45" rx="46" ry="11.5" fill="#d9b56a" />
            <ellipse
                cx="100"
                cy="45"
                rx="33"
                ry="8.2"
                fill="none"
                stroke="rgba(122, 90, 40, 0.4)"
                strokeWidth="1.2"
            />
            {/* rounded crown */}
            <path d="M62,46 Q64,11 100,9 Q136,11 138,46 Q100,56 62,46 Z" fill="#e0bc72" />
            {/* weave arcs */}
            <path d="M70,24 Q100,32 130,24" fill="none" stroke="rgba(122, 90, 40, 0.35)" strokeWidth="1" />
            <path d="M67,32 Q100,41 133,32" fill="none" stroke="rgba(122, 90, 40, 0.45)" strokeWidth="1.2" />
            {/* hat-band */}
            <path d="M63,45 Q100,54 137,45 L136,38 Q100,47 64,38 Z" fill="#77552a" />
            {/* dawn rim-light on crown and brim */}
            <path
                d="M72,17 Q85,10 100,9.6"
                fill="none"
                stroke="#ffe9b0"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.85"
            />
            <path
                d="M56,43 Q76,36 100,34.6"
                fill="none"
                stroke="#ffe9b0"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.5"
            />
        </svg>
    );
}

/* Tiny straw-hat motif for the greeting card. */
function HatMark({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 64 40" aria-hidden="true">
            <ellipse cx="32" cy="28" rx="28" ry="7.5" fill="#8f6b33" />
            <ellipse cx="32" cy="26" rx="28" ry="7" fill="#d9b56a" />
            <path d="M14,26 Q16,6 32,5 Q48,6 50,26 Q32,32 14,26 Z" fill="#e0bc72" />
            <path d="M15,25 Q32,31 49,25 L48,19 Q32,25 16,19 Z" fill="#77552a" />
            <path
                d="M20,11 Q26,6.4 32,6"
                fill="none"
                stroke="#ffe9b0"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.85"
            />
        </svg>
    );
}

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
            {/* ── Act I: sunrise seascape, the camera rig that pushes in and
                   zooms through the raised straw hat ── */}
            <div className={styles.camera} aria-hidden="true">
                <div className={styles.rays} />
                <div className={styles.sun} />
                <div className={`${styles.cloud} ${styles.cloudA}`} />
                <div className={`${styles.cloud} ${styles.cloudB}`} />
                <div className={styles.horizonGlow} />
                <WaveStrip
                    className={styles.waveBack}
                    foam="rgba(255, 218, 138, 0.4)"
                    body="color-mix(in srgb, var(--rail, #123a80) 46%, #0d7fca)"
                />
                <StrawHatVoyager className={styles.hero} />
                <WaveStrip
                    className={styles.waveFront}
                    foam="rgba(190, 226, 255, 0.35)"
                    body="color-mix(in srgb, var(--rail, #123a80) 68%, #041a33)"
                />
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

            {/* ── Act II: through the hat, out into the open dawn sky ── */}
            <div className={styles.skyStage} aria-hidden="true">
                <div className={styles.skyCore} />
                <div className={styles.puffField}>
                    <div className={`${styles.puff} ${styles.puffA}`} />
                    <div className={`${styles.puff} ${styles.puffB}`} />
                    <div className={`${styles.puff} ${styles.puffC}`} />
                    <div className={`${styles.puff} ${styles.puffD}`} />
                    <div className={`${styles.puff} ${styles.puffE}`} />
                </div>
                <div className={styles.iris} />
            </div>

            {/* warm bloom as the camera passes through the hat */}
            <div className={styles.bloom} aria-hidden="true" />

            {/* ── Greeting card (revealed in the sky) ── */}
            <div className={styles.card}>
                <HatMark className={styles.hatMark} />
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
                <div className={styles.sub}>出航 · Welcome aboard the crew</div>
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
