'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './SeaToSky.module.css';
import {
    CelCloud,
    CelCloudWide,
    CelWisp,
    Sailboat,
    Birds,
    Moon,
    WaveBand,
    SeaCrest,
} from './art';

const LETTERS = ['K', 'U', 'M', 'O', 'L', 'A', 'B'];

/* ── Layer choreography — DOLLY-IN ───────────────────────────────────
   The camera pushes FORWARD into the sky. Every cloud layer shares a
   transform-origin at the dive point (50%, 38vh) and SCALES UP with the
   zoom variable --z (near layers hardest), so clouds placed around the
   periphery of the frame grow and sweep radially PAST the camera edges
   — flying through them, not panning past them. Positions below are
   viewport coordinates (top in vh, left in %), deliberately kept OUT of
   the central headline zone (~x 25–75%, y 18–72vh) so the hero copy
   always reads. The sea recedes by scaling down + fading beneath the
   camera; only a slight residual pan remains for flavor. */

/* big foreground cumulus — scale ×(1 + 3.4z): the "through the clouds"
   sweep. Corner placement → they exit past the frame edges by z = 1.
   (The two banks that used to rest ON the water are gone — clouds don't
   sit on the sea; the surviving evaporation accents live in MID/WISPS.) */
const NEAR_CLOUDS = [
    { top: 6, left: 64, w: 30, s: 1.08 },
    { top: 2, left: -4, w: 26, s: 1.05 },
];

/* mid cumulus — scale ×(1 + 2.1z). `op` marks the one water-hugging
   survivor: a soft sea-mist puff, deliberately translucent so it reads
   as evaporation lifting off the surface, not a cloud aground. */
const MID_CLOUDS: { top: number; left: number; w: number; s: number; op?: number }[] = [
    { top: 14, left: 8, w: 18, s: 1 },
    { top: 3, left: 40, w: 13, s: 1 },
    { top: 60, left: 80, w: 16, s: 1.04, op: 0.55 }, // sea-mist accent, right
];

/* small distant puffs hugging the horizon — scale ×(1 + 0.7z), they
   drift gently outward/down and thin out (sense of altitude) */
const FAR_CLOUDS = [
    { top: 46, left: 6, w: 12 },
    { top: 50, left: 30, w: 9 },
    { top: 44, left: 74, w: 13 },
    { top: 49, left: 90, w: 8 },
];

/* wisp streaks — scale ×(1 + 4.6z) (fastest, whip past the lens).
   `op` multiplies the layer's base opacity (see --wop in the CSS): the
   one remaining low wisp is the faintest evaporation haze on the sea,
   and it still whips the bottom-left periphery during the dive. */
const WISPS: { top: number; left: number; w: number; op?: number }[] = [
    { top: 24, left: 0, w: 20 },
    { top: 8, left: 76, w: 20 },
    { top: 78, left: 14, w: 18, op: 0.6 }, // evaporation haze, low left
];

/* sun-glints skittering on the water: {left%, top(vh into sea), delay, dur} */
const GLINTS = [
    { l: 19, t: 6, de: 0, du: 2.6, s: 10 },
    { l: 26, t: 14, de: -0.9, du: 3.1, s: 7 },
    { l: 33, t: 4, de: -1.7, du: 2.2, s: 8 },
    { l: 41, t: 10, de: -0.4, du: 2.9, s: 12 },
    { l: 48, t: 3, de: -2.2, du: 2.4, s: 7 },
    { l: 54, t: 17, de: -1.2, du: 3.4, s: 9 },
    { l: 60, t: 7, de: -0.6, du: 2.3, s: 11 },
    { l: 67, t: 12, de: -1.9, du: 2.8, s: 8 },
    { l: 73, t: 5, de: -0.2, du: 2.5, s: 10 },
    { l: 79, t: 15, de: -1.4, du: 3.2, s: 7 },
    { l: 37, t: 20, de: -2.6, du: 2.7, s: 8 },
    { l: 57, t: 23, de: -0.8, du: 3.0, s: 9 },
];

/* cel specular shimmer bars — slim sheen dashes that swell and fade on
   the water surface: {left%, top(vh into sea), width(vw), delay, dur} */
const SHIMMERS = [
    { l: 24, t: 9, w: 7, de: 0, du: 4.2 },
    { l: 39, t: 16, w: 9, de: -1.3, du: 5.1 },
    { l: 55, t: 6, w: 6, de: -2.6, du: 4.6 },
    { l: 63, t: 21, w: 10, de: -0.7, du: 5.6 },
    { l: 72, t: 11, w: 7, de: -3.4, du: 4.4 },
    { l: 31, t: 26, w: 8, de: -2.0, du: 5.9 },
    { l: 47, t: 30, w: 9, de: -4.1, du: 6.2 },
];

/* twinkling stars for night mode: {left%, top%, size, delay, dur} */
const STARS = [
    { l: 8, t: 10, s: 2.5, de: 0, du: 3.4 },
    { l: 16, t: 26, s: 1.6, de: -1.2, du: 4.1 },
    { l: 24, t: 8, s: 2, de: -2.4, du: 3.0 },
    { l: 31, t: 20, s: 1.4, de: -0.6, du: 4.6 },
    { l: 39, t: 12, s: 2.6, de: -1.8, du: 3.6 },
    { l: 46, t: 30, s: 1.5, de: -3.0, du: 4.2 },
    { l: 52, t: 6, s: 1.8, de: -0.3, du: 3.2 },
    { l: 58, t: 22, s: 2.3, de: -2.1, du: 3.9 },
    { l: 66, t: 14, s: 1.5, de: -1.0, du: 4.4 },
    { l: 72, t: 28, s: 2, de: -2.7, du: 3.3 },
    { l: 79, t: 9, s: 2.7, de: -0.9, du: 3.7 },
    { l: 86, t: 24, s: 1.6, de: -1.6, du: 4.0 },
    { l: 92, t: 15, s: 2, de: -2.9, du: 3.5 },
    { l: 12, t: 38, s: 1.4, de: -0.4, du: 4.5 },
    { l: 69, t: 40, s: 1.7, de: -2.2, du: 3.8 },
    { l: 43, t: 44, s: 1.5, de: -1.4, du: 4.3 },
];

export default function SeaToSky() {
    const journeyRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);
    // Gates the SMIL path/wing animations (waves + birds). Starts false to
    // match SSR; flips true after mount only when reduced motion is asked.
    const [reduce, setReduce] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setLoaded(true));
        setReduce(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    }, []);

    /* Scroll camera — a DAMPED rAF loop that reads like a slow DOLLY-IN.
       Each frame it eases the displayed progress toward the scroll-derived
       target (cur += (target - cur) * 0.09) so motion GLIDES with weight
       instead of tracking the wheel pixel-for-pixel, then writes:
         --p   ∈ [0,1]  smoothed progress (opacity fades, --mid, content)
         --e   easeInOut(p) — residual pan / content push mapping
         --se  easeIn(p)    — the sea receding beneath the camera
         --z   THE ZOOM — 0 until p passes the 0.08 threshold, then an
               easeInOut ramp to 1 by p ≈ 0.9. Drives every scale-up:
               the dominant motion of the journey is this dolly forward.
         --mid hump peaking at p=0.5 — sun/moon god-ray bloom in the clouds
       Transform/opacity/filter only; no React re-renders, one rect read
       per frame, loop only runs while the journey is near the viewport. */
    useEffect(() => {
        const journey = journeyRef.current;
        const stage = stageRef.current;
        if (!journey || !stage) return;

        const easeInOut = (x: number) =>
            x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

        const setVars = (cur: number) => {
            const e = easeInOut(cur);
            const se = Math.pow(cur, 1.5);
            // zoom takes over past the initial threshold of the journey
            const z = easeInOut(Math.min(1, Math.max(0, (cur - 0.08) / 0.82)));
            stage.style.setProperty('--p', cur.toFixed(4));
            stage.style.setProperty('--e', e.toFixed(4));
            stage.style.setProperty('--se', se.toFixed(4));
            stage.style.setProperty('--z', z.toFixed(4));
            stage.style.setProperty('--mid', (cur * (1 - cur) * 4).toFixed(4));
        };

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            setVars(0);
            return;
        }

        let raf = 0;
        let running = false;
        let past = false;
        let cur = 0;

        const tick = () => {
            const rect = journey.getBoundingClientRect();
            const track = rect.height - window.innerHeight;
            const target = track > 0 ? Math.min(1, Math.max(0, -rect.top / track)) : 0;
            // damped glide toward the scroll target — a little weight, but
            // tight enough to feel responsive (near-1:1) to the wheel/finger
            cur += (target - cur) * 0.16;
            if (Math.abs(target - cur) < 0.0004) cur = target;
            setVars(cur);
            const nowPast = cur > 0.34;
            if (nowPast !== past) {
                past = nowPast;
                stage.dataset.past = nowPast ? '1' : '0';
            }
            if (running) raf = requestAnimationFrame(tick);
        };

        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !running) {
                    running = true;
                    raf = requestAnimationFrame(tick);
                } else if (!entry.isIntersecting && running) {
                    running = false;
                    cancelAnimationFrame(raf);
                }
            },
            { rootMargin: '80px 0px 80px 0px' }
        );
        io.observe(journey);

        return () => {
            io.disconnect();
            running = false;
            cancelAnimationFrame(raf);
        };
    }, []);

    /* ── SCROLL ASSIST — take over on the FIRST scroll ───────────────────
       Lazy-scroll helper for the hero. The instant the visitor scrolls (or
       swipes) down AT ALL from the top, we take over and GLIDE them through
       the whole sea→sky dolly automatically, dropping them where the content
       begins — same for desktop wheel and mobile swipe. From the landing, a
       small scroll UP glides them back to the top. At any point during a
       glide they can PRESS & HOLD (mouse or finger) to grab the reel and
       SCRUB the animation by dragging; releasing resumes the auto-glide.
       Native wheel/touch is suppressed only while WE are driving (auto or
       scrub). No-ops under reduced motion. */
    useEffect(() => {
        const journey = journeyRef.current;
        if (!journey) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

        const TRIGGER = 0.02; // hand off on the first bit of scroll from the top
        const REARM = 0.01; // re-arm the trigger once back at the very top
        const SCRUB_GAIN = 1.6; // scroll px per drag px while scrubbing
        const NAV_KEYS = new Set([
            ' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End',
        ]);

        const easeInOut = (x: number) =>
            x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

        // The page sets `scroll-behavior: smooth` globally; our per-frame
        // programmatic scrolls must be INSTANT or each frame would kick off a
        // fresh smooth-scroll that fights the last one and stalls the glide.
        const jumpTo = (y: number) =>
            window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior });

        type Mode = 'idle' | 'auto' | 'scrub' | 'done';
        let autoRAF = 0;
        let pointerActive = false;
        let lastPointerY = 0;
        let scrubStartPointerY = 0;
        let scrubStartScrollY = 0;

        const metrics = () => ({
            rectTop: journey.getBoundingClientRect().top,
            track: journey.offsetHeight - window.innerHeight,
        });
        const progress = () => {
            const { rectTop, track } = metrics();
            return track > 0 ? clamp01(-rectTop / track) : 0;
        };

        // Absolute scroll Y bounds for the assisted range. The END prefers a
        // marked post-hero landing section ([data-sky-landing]) so the ride
        // continues PAST the raw payoff and drops the user with the payoff
        // docked at the top and the first content section framed below — no
        // dead full screen. Falls back to the journey end (progress 1) when
        // no marker is present yet.
        const startTargetY = () => window.scrollY + metrics().rectTop;
        const endTargetY = () => {
            const { rectTop, track } = metrics();
            let e = window.scrollY + rectTop + track; // journey end (progress 1)
            const landing = document.querySelector('[data-sky-landing]');
            if (landing instanceof HTMLElement) {
                const landTop = landing.getBoundingClientRect().top + window.scrollY;
                if (landTop > e) e = landTop; // extend into the content landing
            }
            return e;
        };

        // Don't hijack a reload that lands mid-journey — only arm from the top.
        let mode: Mode = progress() >= TRIGGER ? 'done' : 'idle';

        const stopAuto = () => {
            if (autoRAF) cancelAnimationFrame(autoRAF);
            autoRAF = 0;
        };

        // One glide primitive, either direction. targetY is an absolute scroll
        // position; endMode is where we settle when it arrives.
        const glide = (targetY: number, endMode: Mode) => {
            stopAuto();
            const startY = window.scrollY;
            const dist = targetY - startY;
            if (Math.abs(dist) <= 8) {
                mode = endMode;
                return;
            }
            mode = 'auto';
            const dur = Math.min(1500, Math.max(600, Math.abs(dist) * 0.9));
            const t0 = performance.now();
            const step = (now: number) => {
                if (mode !== 'auto') return;
                const k = Math.min((now - t0) / dur, 1);
                jumpTo(startY + dist * easeInOut(k));
                if (k < 1) autoRAF = requestAnimationFrame(step);
                else {
                    autoRAF = 0;
                    mode = endMode;
                }
            };
            autoRAF = requestAnimationFrame(step);
        };
        // Down: from the top, ride to the landing. Up: from the landing, ride
        // back to the very top. Symmetric ease in both directions.
        const glideDown = () => {
            if (metrics().track <= 0) {
                mode = 'done';
                return;
            }
            glide(endTargetY(), 'done');
        };
        const glideUp = () => glide(startTargetY(), 'idle');

        const beginScrub = (pointerY: number) => {
            stopAuto();
            mode = 'scrub';
            scrubStartPointerY = pointerY;
            scrubStartScrollY = window.scrollY;
        };
        // On release, snap to whichever end of the ride is nearer, so the hero
        // always settles cleanly at the top or the landing — never stranded
        // mid-dolly, in either direction.
        const endScrub = () => {
            if (mode !== 'scrub') return;
            const endY = endTargetY();
            if (window.scrollY <= endY * 0.5) {
                if (window.scrollY <= 8) mode = 'idle';
                else glide(startTargetY(), 'idle');
            } else {
                if (window.scrollY >= endY - 8) mode = 'done';
                else glide(endTargetY(), 'done');
            }
        };

        const onScroll = () => {
            if (mode === 'idle') {
                // scrolled/swiped DOWN at all from the top → ride to the
                // landing automatically (desktop wheel and mobile swipe alike)
                if (progress() >= TRIGGER) glideDown();
            } else if (mode === 'done') {
                // scrolled back UP a touch from the landing, still inside the
                // hero span → ride back to the top.
                const upThreshold = endTargetY() - TRIGGER * metrics().track;
                if (window.scrollY <= upThreshold) {
                    glideUp();
                } else if (progress() < REARM) {
                    mode = 'idle';
                }
            }
        };

        const onPointerDown = (e: PointerEvent) => {
            pointerActive = true;
            lastPointerY = e.clientY;
            if (mode !== 'auto') return; // only grab the reel mid-glide
            const el = e.target as HTMLElement | null;
            // never steal a click on the CTAs / nav / form controls
            if (el && el.closest('a, button, [role="button"], input, textarea, select')) return;
            beginScrub(e.clientY);
        };
        const onPointerMove = (e: PointerEvent) => {
            lastPointerY = e.clientY;
            if (mode !== 'scrub') return;
            const dy = scrubStartPointerY - e.clientY; // drag up → advance
            const next = Math.min(
                endTargetY(),
                Math.max(startTargetY(), scrubStartScrollY + dy * SCRUB_GAIN)
            );
            jumpTo(next);
        };
        const onPointerUp = () => {
            pointerActive = false;
            endScrub();
        };

        // Suppress native scroll ONLY while we're driving.
        const suppress = (e: Event) => {
            if (mode === 'auto' || mode === 'scrub') e.preventDefault();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if ((mode === 'auto' || mode === 'scrub') && NAV_KEYS.has(e.key)) {
                const t = e.target as HTMLElement | null;
                if (t && t.closest('input, textarea, select, [contenteditable]')) return;
                e.preventDefault();
            }
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointercancel', onPointerUp, { passive: true });
        window.addEventListener('wheel', suppress, { passive: false });
        window.addEventListener('touchmove', suppress, { passive: false });
        window.addEventListener('keydown', onKeyDown);

        return () => {
            stopAuto();
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('wheel', suppress);
            window.removeEventListener('touchmove', suppress);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    return (
        <section ref={journeyRef} className={styles.journey} aria-label="KumoLab — from the sea to above the clouds">
            <div ref={stageRef} className={styles.stage} data-past="0">
                {/* ── SKY PANORAMA: zenith → horizon gradient with dusk +
                       night cross-fade layers (opacity driven by --t) and
                       star field. 250vh tall; scales up (dolly-in) with --z. ── */}
                <div className={styles.skyWorld} aria-hidden="true">
                    <div className={styles.skyDusk} />
                    <div className={styles.skyNight} />
                    <div className={styles.starField} />
                    <div className={styles.stars}>
                        {STARS.map((s, i) => (
                            <span
                                key={i}
                                className={styles.star}
                                style={
                                    {
                                        left: `${s.l}%`,
                                        top: `${s.t}%`,
                                        width: s.s,
                                        height: s.s,
                                        '--de': `${s.de}s`,
                                        '--du': `${s.du}s`,
                                    } as React.CSSProperties
                                }
                            />
                        ))}
                    </div>
                </div>

                {/* far puffs — hug the horizon, thin out with altitude */}
                <div className={styles.layerFar} aria-hidden="true">
                    {FAR_CLOUDS.map((c, i) => (
                        <CelCloud
                            key={i}
                            id={`far-${i}`}
                            className={styles.cloudFar}
                            style={{ top: `${c.top}vh`, left: `${c.left}%`, width: `${c.w}vw` }}
                        />
                    ))}
                </div>

                {/* ── ANCHORED LIGHT SOURCE — a celestial "orrery" ──
                       The sun and moon ride opposite ends of one wheel that
                       pivots below the horizon. During SCROLL the wheel is
                       static, so the light stays ANCHORED on screen while the
                       world moves around it (glow/god-rays react to --mid).
                       On a THEME TOGGLE the wheel rotates with --t: the sun
                       arcs down and sets toward the right while the moon
                       rises from the left (and reverse on toggle back).
                       Sits below the near clouds so they drift across and
                       occlude it mid-climb. ── */}
                <div className={styles.lightStage} aria-hidden="true">
                    <div className={styles.orrery}>
                        <div className={styles.wheel}>
                            <div className={styles.sunHolder}>
                                <span className={styles.sunGlow} />
                                <span className={styles.godrays} />
                                <span className={styles.sunCore} />
                                <span className={styles.sunRing} />
                            </div>
                            <div className={styles.moonHolder}>
                                <span className={styles.moonGlow} />
                                <span className={styles.moonRays} />
                                <Moon id="moon" className={styles.moonDisc} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── THE SEA (k = 1.15): wavy horizon crest, cel wave
                       bands, glints, island, sailboat. ── */}
                <div className={styles.sea} aria-hidden="true">
                    {/* deep body fill behind the rolling waves */}
                    <div className={styles.seaBody} />

                    {/* undulating horizon crest — sky shows through the
                        scallops above the wave, bright cel foam on top */}
                    <div className={styles.horizonCrest}>
                        <SeaCrest id="crest" body="#3bb4ea" foam="#e6fbff" dur={19} animate={!reduce} className={styles.crestSvg} />
                    </div>
                    <div className={styles.horizonHaze} />

                    <div className={`${styles.waveLayer} ${styles.wave2}`}>
                        <WaveBand id="w2" body="#149fdc" crest="#8fe4ff" deep="#0e86c6" dur={13} shift={0} animate={!reduce} className={styles.waveSvg} />
                    </div>
                    <div className={`${styles.waveLayer} ${styles.wave3}`}>
                        <WaveBand id="w3" body="#0d7fca" crest="#5fd0f5" deep="#0968ad" dur={10.5} shift={2.2} animate={!reduce} className={styles.waveSvg} />
                    </div>

                    {/* moonlight glitter path on the water — night only (--t) */}
                    <div className={styles.moonGlitter} />

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
                                    } as React.CSSProperties
                                }
                            />
                        ))}
                        {/* cel specular sheen — slim bars swelling on the surface */}
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
                                    } as React.CSSProperties
                                }
                            />
                        ))}
                    </div>

                    {/* the sailboat drifts across the whole seascape while
                        bobbing — two nested transforms, both seamless loops */}
                    <div className={styles.boatDrift}>
                        <div className={styles.boatBob}>
                            <Sailboat id="boat" className={styles.boat} />
                        </div>
                    </div>
                </div>

                {/* ── BIRDS — a small flock gliding across the sky; fades
                       out as the zoom dive begins, faint at night ── */}
                <div className={styles.birdLayer} aria-hidden="true">
                    <div className={styles.flightA}>
                        <Birds id="fa" animate={!reduce} className={styles.birdSvg} />
                    </div>
                    <div className={styles.flightB}>
                        <Birds id="fb" animate={!reduce} className={styles.birdSvg} />
                    </div>
                    <div className={styles.flightC}>
                        <Birds id="fc" animate={!reduce} className={styles.birdSvg} />
                    </div>
                </div>

                {/* mid cumulus — swells and slides outward past the frame */}
                <div className={styles.layerMid} aria-hidden="true">
                    {MID_CLOUDS.map((c, i) => (
                        <div
                            key={i}
                            className={styles.cloudDriftM}
                            style={{ top: `${c.top}vh`, left: `${c.left}%`, width: `${c.w}vw`, animationDuration: `${21 / c.s}s`, opacity: c.op }}
                        >
                            <CelCloud id={`mid-${i}`} className={styles.cloudSvg} />
                        </div>
                    ))}
                </div>

                {/* big foreground cumulus — the "through the clouds" beat:
                       corner-anchored, they balloon past the camera edges */}
                <div className={styles.layerNear} aria-hidden="true">
                    {NEAR_CLOUDS.map((c, i) => (
                        <div
                            key={i}
                            className={styles.cloudDriftN}
                            style={{ top: `${c.top}vh`, left: `${c.left}%`, width: `${c.w}vw`, animationDuration: `${25 / c.s}s` }}
                        >
                            <CelCloudWide id={`near-${i}`} className={styles.cloudSvg} />
                        </div>
                    ))}
                </div>

                {/* wisp streaks — the fastest layer, whipping past the lens */}
                <div className={styles.layerWisp} aria-hidden="true">
                    {WISPS.map((c, i) => (
                        <CelWisp
                            key={i}
                            id={`wisp-${i}`}
                            className={styles.wisp}
                            style={
                                {
                                    top: `${c.top}vh`,
                                    left: `${c.left}%`,
                                    width: `${c.w}vw`,
                                    '--wop': c.op ?? 1,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>

                {/* light motes drifting during the ascent */}
                <div className={styles.motes} aria-hidden="true">
                    {[12, 26, 41, 57, 70, 84, 93].map((x, i) => (
                        <span
                            key={i}
                            className={styles.mote}
                            style={{ left: `${x}%`, animationDelay: `${-i * 2.7}s`, animationDuration: `${15 + (i % 4) * 3}s` }}
                        />
                    ))}
                </div>

                {/* ── HERO CONTENT — rides the deck, fades as we lift off ── */}
                <div className={`${styles.content} ${loaded ? styles.loaded : ''}`}>
                    <div className={styles.badge}>
                        <span className={styles.badgeDot} />
                        <span className={styles.badgeText}>雲の上から · From Above the Clouds</span>
                    </div>

                    <h1 className={styles.wordmark} aria-label="KumoLab">
                        {LETTERS.map((ch, i) => (
                            <span
                                key={i}
                                className={styles.letter}
                                style={{ '--i': i } as React.CSSProperties}
                                aria-hidden="true"
                            >
                                {ch}
                            </span>
                        ))}
                    </h1>

                    <p className={styles.tagline}>Anime, above the noise.</p>

                    <p className={styles.sub}>
                        Verified drops, trailers, and industry intel, curated daily for 360K+
                        fans. And now: the first KumoLab collection has landed.
                    </p>

                    <div className={styles.ctas}>
                        <Link href="/merch" className={styles.primaryCta}>
                            <span className={styles.ctaShine} />
                            <span className={styles.ctaText}>Shop the Collection</span>
                        </Link>
                        <Link href="/blog" className={styles.secondaryCta}>
                            <span className={styles.ctaText}>Explore the Feed →</span>
                        </Link>
                    </div>

                    <div className={styles.scrollCue}>
                        <span className={styles.scrollLabel}>Ascend</span>
                        <span className={styles.scrollLine} />
                    </div>
                </div>

                {/* ── PAYOFF — the clear brilliant blue. Blooms at the end of
                       the dive, then rises + condenses away as its docked twin
                       (the [data-sky-landing] header in SkyHome) glides up to
                       take its place at the top of the viewport — decorative
                       here; the landing header is the real accessible copy. ── */}
                <div className={styles.payoff} aria-hidden="true">
                    <div className={styles.payoffKanji}>雲の上へ</div>
                    <div className={styles.payoffLine}>Welcome above the clouds.</div>
                </div>
            </div>
        </section>
    );
}
