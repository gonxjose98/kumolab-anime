'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import styles from './WelcomeCinematic.module.css';
import {
    CelCloud,
    CelCloudWide,
    CelWisp,
    Sailboat,
    Birds,
    WaveBand,
    SeaCrest,
} from '../../redesign-sky/art';

/* == WelcomeCinematic v4: the homepage "sea to sky" dive, auto-played ==
   The exact SeaToSky world: sunlit sea with rolling cel waves, a little
   sailboat, the anchored sun, drifting cel cumulus and a small flock of
   birds. Instead of scroll, a single requestAnimationFrame timeline
   drives the homepage camera model: progress `cur` runs 0 to 1 over
   DIVE_MS (time-eased: gentle start, momentum, settle), and each frame
   writes the same five CSS vars the homepage writes:
     --p   raw smoothed progress
     --e   easeInOut(cur): residual pan, sky glide
     --se  cur^1.5: the sea receding beneath the camera
     --z   THE ZOOM: easeInOut((cur - 0.08) / 0.82): the dolly forward
     --mid cur*(1-cur)*4: sun bloom hump peaking mid-dive
   The camera dollies forward and UP through the clouds, emerges into
   the open bright sky, sunlit cumulus settle around the frame, and the
   greeting lands on the member's name.

   Timeline (ms): 0 overlay in / 150 dive begins / ~5150 dive settles,
   emerged sky holds / 4550 yokoso / 4900 "Welcome," / 5150 name impact
   + ring / 5650 subtitle / 5950 glint / 6300 exit fade / ~6950 onDone.
   Reduced motion: vars jump to the end state (the emerged-sky key
   frame), greeting shows immediately, hold ~1.6s, fade, onDone ~2.25s. */
const DIVE_MS = 5000;
const DIVE_DELAY = 150;
const LEAVE_AT = 6300;
const LEAVE_AT_REDUCED = 1600;
const EXIT_MS = 650;

/* == Layer placements: the homepage's own choreography ================
   Same viewport coordinates as SeaToSky (top in vh, left in %), kept
   out of the central zone so the greeting always reads. */

/* big foreground cumulus: scale x(1 + 3.4z), corner-placed so they
   balloon and sweep PAST the frame edges by z = 1 */
const NEAR_CLOUDS = [
    { top: 6, left: 64, w: 30, s: 1.08 },
    { top: 2, left: -4, w: 26, s: 1.05 },
];

/* mid cumulus: scale x(1 + 2.1z). `op` marks the translucent sea-mist
   survivor hugging the water on the right. */
const MID_CLOUDS: { top: number; left: number; w: number; s: number; op?: number }[] = [
    { top: 14, left: 8, w: 18, s: 1 },
    { top: 3, left: 40, w: 13, s: 1 },
    { top: 60, left: 80, w: 16, s: 1.04, op: 0.55 },
];

/* small distant puffs hugging the horizon: scale x(1 + 0.7z) */
const FAR_CLOUDS = [
    { top: 46, left: 6, w: 12 },
    { top: 50, left: 30, w: 9 },
    { top: 44, left: 74, w: 13 },
    { top: 49, left: 90, w: 8 },
];

/* wisp streaks: scale x(1 + 4.6z), the fastest layer past the lens */
const WISPS: { top: number; left: number; w: number; op?: number }[] = [
    { top: 24, left: 0, w: 20 },
    { top: 8, left: 76, w: 20 },
    { top: 78, left: 14, w: 18, op: 0.6 },
];

/* sun-glints skittering on the water: {left%, top(vh into sea), delay, dur, size} */
const GLINTS = [
    { l: 22, t: 6, de: 0, du: 2.6, s: 9 },
    { l: 33, t: 12, de: -1.1, du: 3.1, s: 7 },
    { l: 44, t: 4, de: -1.7, du: 2.3, s: 8 },
    { l: 55, t: 15, de: -0.5, du: 2.9, s: 10 },
    { l: 64, t: 7, de: -2.1, du: 2.4, s: 7 },
    { l: 74, t: 11, de: -1.4, du: 3.3, s: 9 },
    { l: 38, t: 19, de: -2.5, du: 2.7, s: 8 },
    { l: 58, t: 22, de: -0.8, du: 3.0, s: 8 },
];

/* cel specular shimmer bars swelling on the surface */
const SHIMMERS = [
    { l: 28, t: 9, w: 8, de: 0, du: 4.4 },
    { l: 50, t: 17, w: 9, de: -1.6, du: 5.2 },
    { l: 68, t: 8, w: 7, de: -3.0, du: 4.8 },
];

/* == The emerged-sky framing: sunlit cumulus settling around the name.
   Driven by --p in CSS (fades and settles in as the dive completes),
   so it lands in perfect sync with the camera, not a wall-clock guess.
   Two wide banks frame the bottom; two small puffs balance the top. */
const FRAME_CLOUDS: { wide: boolean; style: CSSProperties }[] = [
    { wide: true, style: { bottom: '-8vh', left: '-14%', width: '60vw', animationDelay: '-3s' } },
    { wide: true, style: { bottom: '-11vh', left: '50%', width: '66vw', animationDelay: '-11s' } },
    { wide: false, style: { top: '7vh', left: '76%', width: '24vw', animationDelay: '-6s' } },
    { wide: false, style: { top: '10vh', left: '-6%', width: '22vw', animationDelay: '-15s' } },
];

export default function WelcomeCinematic({ name, onDone }: { name: string; onDone: () => void }) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [leaving, setLeaving] = useState(false);
    /* Gates the SMIL wave/wing animations; starts false to match SSR. */
    const [reduce, setReduce] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const doneRef = useRef(false);
    const onDoneRef = useRef(onDone);
    const timersRef = useRef<number[]>([]);

    /* Keep the latest onDone without re-arming the mount timeline. */
    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    /* Begin the exit fade, then fire onDone exactly once (ref-guarded). */
    const leave = useCallback(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        setLeaving(true);
        timersRef.current.push(window.setTimeout(() => onDoneRef.current(), EXIT_MS));
    }, []);

    /* SMIL gating (waves + bird wings): read the media queries after
       mount, deferred a frame so the first render matches SSR. */
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            setReduce(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
            setIsMobile(!!window.matchMedia?.('(max-width: 640px)').matches);
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    /* == THE AUTO DOLLY: one rAF loop drives the homepage camera model.
       Time is eased (easeInOutCubic) so the dive starts gentle, gains
       momentum through the clouds, and settles in the open sky; the
       homepage's own var mapping then shapes each layer exactly as the
       scroll journey does. Reduced motion: jump to the end state. */
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const prefersReduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        const easeInOut = (x: number) =>
            x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

        /* The homepage setVars, verbatim: four vars from one progress. */
        const setVars = (cur: number) => {
            const e = easeInOut(cur);
            const se = Math.pow(cur, 1.5);
            const z = easeInOut(Math.min(1, Math.max(0, (cur - 0.08) / 0.82)));
            root.style.setProperty('--p', cur.toFixed(4));
            root.style.setProperty('--e', e.toFixed(4));
            root.style.setProperty('--se', se.toFixed(4));
            root.style.setProperty('--z', z.toFixed(4));
            root.style.setProperty('--mid', (cur * (1 - cur) * 4).toFixed(4));
        };

        if (prefersReduce) {
            setVars(1); // the emerged-sky key frame, held statically
            return;
        }

        setVars(0);
        let raf = 0;
        const t0 = performance.now();
        const tick = (now: number) => {
            const k = Math.min(1, Math.max(0, (now - t0 - DIVE_DELAY) / DIVE_MS));
            setVars(easeInOut(k)); // gentle start, momentum, settle
            if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    /* Auto-leave timer + Escape to skip; everything cleaned on unmount. */
    useEffect(() => {
        const prefersReduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        timersRef.current.push(
            window.setTimeout(leave, prefersReduce ? LEAVE_AT_REDUCED : LEAVE_AT)
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
            ref={rootRef}
            className={`${styles.overlay} ${leaving ? styles.leaving : ''}`}
            role="dialog"
            aria-label={`Welcome, ${name}`}
            onClick={leave}
        >
            {/* == SKY PANORAMA: the homepage zenith-to-horizon gradient,
                   250vh tall; glides down with --e and scales with --z == */}
            <div className={styles.skyWorld} aria-hidden="true" />

            {/* == far puffs hugging the horizon: scale x(1 + 0.7z) == */}
            <div className={styles.layerFar} aria-hidden="true">
                {FAR_CLOUDS.map((c, i) => (
                    <CelCloud
                        key={i}
                        id={`wc-far-${i}`}
                        className={styles.cloudFar}
                        style={{ top: `${c.top}vh`, left: `${c.left}%`, width: `${c.w}vw` }}
                    />
                ))}
            </div>

            {/* == THE SEA: crest horizon, rolling wave bands, glints,
                   the little sailboat. Recedes beneath the camera with
                   --se exactly like the homepage. == */}
            <div className={styles.sea} aria-hidden="true">
                <div className={styles.seaBody} />
                <div className={styles.horizonCrest}>
                    <SeaCrest id="wc-crest" body="#3bb4ea" foam="#e6fbff" dur={19} animate={!reduce} className={styles.crestSvg} />
                </div>
                <div className={styles.horizonHaze} />
                <div className={`${styles.waveLayer} ${styles.wave2}`}>
                    <WaveBand id="wc-w2" body="#149fdc" crest="#8fe4ff" deep="#0e86c6" dur={13} shift={0} animate={!reduce} animateBack={!reduce && !isMobile} className={styles.waveSvg} />
                </div>
                <div className={`${styles.waveLayer} ${styles.wave3}`}>
                    <WaveBand id="wc-w3" body="#0d7fca" crest="#5fd0f5" deep="#0968ad" dur={10.5} shift={2.2} animate={!reduce} animateBack={!reduce && !isMobile} className={styles.waveSvg} />
                </div>
                <div className={styles.glints}>
                    {GLINTS.map((g, i) => (
                        <span
                            key={i}
                            className={styles.glint}
                            style={
                                {
                                    left: `${g.l}%`,
                                    top: `${g.t}vh`,
                                    width: g.s,
                                    height: g.s,
                                    '--de': `${g.de}s`,
                                    '--du': `${g.du}s`,
                                } as CSSProperties
                            }
                        />
                    ))}
                    {SHIMMERS.map((sh, i) => (
                        <span
                            key={`sh-${i}`}
                            className={styles.shimmer}
                            style={
                                {
                                    left: `${sh.l}%`,
                                    top: `${sh.t}vh`,
                                    width: `${sh.w}vw`,
                                    '--de': `${sh.de}s`,
                                    '--du': `${sh.du}s`,
                                } as CSSProperties
                            }
                        />
                    ))}
                </div>
                <div className={styles.boatDrift}>
                    <div className={styles.boatBob}>
                        <Sailboat id="wc-boat" className={styles.boat} />
                    </div>
                </div>
            </div>

            {/* == BIRDS: a small flock gliding across the sky, fading
                   out as the zoom dive begins == */}
            <div className={styles.birdLayer} aria-hidden="true">
                <div className={styles.flightA}>
                    <Birds id="wc-fa" animate={!reduce} className={styles.birdSvg} />
                </div>
                <div className={styles.flightB}>
                    <Birds id="wc-fb" animate={!reduce} className={styles.birdSvg} />
                </div>
                <div className={styles.flightC}>
                    <Birds id="wc-fc" animate={!reduce} className={styles.birdSvg} />
                </div>
            </div>

            {/* == mid cumulus: swells and slides outward past the frame == */}
            <div className={styles.layerMid} aria-hidden="true">
                {MID_CLOUDS.map((c, i) => (
                    <div
                        key={i}
                        className={styles.cloudDriftM}
                        style={{ top: `${c.top}vh`, left: `${c.left}%`, width: `${c.w}vw`, animationDuration: `${21 / c.s}s`, opacity: c.op }}
                    >
                        <CelCloud id={`wc-mid-${i}`} className={styles.cloudSvg} />
                    </div>
                ))}
            </div>

            {/* == ANCHORED SUN: warm core, soft glow, faint conic
                   god-rays swelling with --mid at the heart of the dive == */}
            <div className={styles.sun} aria-hidden="true">
                <span className={styles.sunGlow} />
                <span className={styles.godrays} />
                <span className={styles.sunCore} />
            </div>

            {/* == big foreground cumulus: the "through the clouds" beat,
                   corner-anchored, ballooning past the camera edges == */}
            <div className={styles.layerNear} aria-hidden="true">
                {NEAR_CLOUDS.map((c, i) => (
                    <div
                        key={i}
                        className={styles.cloudDriftN}
                        style={{ top: `${c.top}vh`, left: `${c.left}%`, width: `${c.w}vw`, animationDuration: `${25 / c.s}s` }}
                    >
                        <CelCloudWide id={`wc-near-${i}`} className={styles.cloudSvg} />
                    </div>
                ))}
            </div>

            {/* == wisp streaks: the fastest layer, whipping past the lens == */}
            <div className={styles.layerWisp} aria-hidden="true">
                {WISPS.map((c, i) => (
                    <CelWisp
                        key={i}
                        id={`wc-wisp-${i}`}
                        className={styles.wisp}
                        style={
                            {
                                top: `${c.top}vh`,
                                left: `${c.left}%`,
                                width: `${c.w}vw`,
                                '--wop': c.op ?? 1,
                            } as CSSProperties
                        }
                    />
                ))}
            </div>

            {/* == the emerged sky: fresh sunlit cumulus settle around the
                   greeting as the dive completes (driven by --p) == */}
            <div className={styles.frameField} aria-hidden="true">
                {FRAME_CLOUDS.map((c, i) =>
                    c.wide ? (
                        <CelCloudWide key={i} id={`wc-frame-${i}`} className={styles.frameCloud} style={c.style} />
                    ) : (
                        <CelCloud key={i} id={`wc-frame-${i}`} className={styles.frameCloud} style={c.style} />
                    )
                )}
            </div>

            {/* airy bright edge haze once we are above the clouds */}
            <div className={styles.haze} aria-hidden="true" />

            {/* == the greeting, revealed in the open sky == */}
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
                <div className={styles.sub}>雲の上へ · Welcome above the clouds</div>
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
