'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import styles from './WelcomeCinematic.module.css';
import { CelCloud, CelCloudWide, CelWisp } from '../../redesign-sky/art';

/* == Timeline (ms) ====================================================
   Full motion: the homepage "sea to sky" daytime sky. A triumphant
   voyager stands low-center, back to camera, both arms raised in a V,
   a woven straw hat crowned against the sun. The camera settles, then
   dollies forward and UP: cel cumulus balloon past the frame edges
   (the homepage "through the clouds" beat) while the camera climbs the
   figure and rises PAST the raised hat crown (warm bloom), emerging
   into open bright sky where fresh sunlit cumulus settle and the
   greeting lands: gold "yokoso", "Welcome,", the name with a glint,
   and the subtitle. Leave begins at 6300, the exit fade runs 650,
   onDone fires at ~6950.
   Reduced: a static key frame (the voyager, arms raised, straw hat,
   bright homepage sky, greeting on glass) held ~1.6s, same fade. */
const LEAVE_AT = 6300;
const LEAVE_AT_REDUCED = 1600;
const EXIT_MS = 650;

/* Light motes drifting up through the ascent, SeaToSky-style: fixed
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

/* Peripheral cel cumulus (homepage art, imported): corner-placed so the
   dolly scale-up sweeps them radially PAST the frame edges. All are kept
   out of the central figure/name zone. Positions are viewport units;
   float delay/duration desync the gentle wind sway per cloud. */
const MID_CLOUDS: { top: string; left: string; w: string; de: string; du: string }[] = [
    { top: '3vh', left: '-9%', w: '30vw', de: '0s', du: '19s' },
    { top: '6vh', left: '73%', w: '33vw', de: '-7s', du: '23s' },
    { top: '30vh', left: '86%', w: '18vw', de: '-13s', du: '21s' },
    { top: '27vh', left: '-7%', w: '16vw', de: '-4s', du: '25s' },
];

/* Slim wisps: the fastest layer, whipping past the lens mid-dive. */
const WISPS: { top: string; left: string; w: string; op: number }[] = [
    { top: '18vh', left: '-5%', w: '24vw', op: 0.8 },
    { top: '10vh', left: '77%', w: '22vw', op: 0.7 },
];

/* The sunlit cloud bank the voyager stands above: hugs the bottom edge
   on every aspect ratio and gracefully hides where the legs end. */
const BANK: { bottom: string; left: string; w: string; de: string }[] = [
    { bottom: '-7vh', left: '-14%', w: '62vw', de: '-3s' },
    { bottom: '-10vh', left: '46%', w: '68vw', de: '-11s' },
];

/* Emergence field: after the camera clears the hat, fresh cumulus settle
   from slightly-too-close to at-rest around the open sky. */
const EMERGE: { wide: boolean; style: CSSProperties }[] = [
    { wide: true, style: { bottom: '-6vh', left: '-12%', width: '58vw', animationDelay: '-2s' } },
    { wide: true, style: { bottom: '-9vh', left: '50%', width: '64vw', animationDelay: '-9s' } },
    { wide: false, style: { top: '5vh', left: '-7%', width: '26vw', animationDelay: '-5s' } },
    { wide: false, style: { top: '9vh', left: '76%', width: '28vw', animationDelay: '-14s' } },
    { wide: false, style: { top: '36vh', left: '88%', width: '14vw', animationDelay: '-7s' } },
];

/* == The voyager ======================================================
   An ORIGINAL cel-shaded figure: a young adventurer seen from behind
   and slightly below, standing tall above the clouds, BOTH arms raised
   in a triumphant V toward the sun. Original design choices: an indigo
   sleeveless top, warm sand rolled shorts, dark boots, and the hero
   prop: a woven straw hat (rounded crown, wide brim seen from
   below-behind, a saturated blue hat-band, weave arcs, and the same
   warm cream sunlit rim the homepage clouds use). Cel shading: clean
   ink outline, 2-3 tone steps per part, warm rim light on the
   sun-facing top edges, cool shade beneath.

   Anchor math: viewBox is 320x360 and the hat-crown pass-over point
   sits at y = 44, i.e. 12.2% of the art height. The module.css places
   this point exactly on the camera anchor (--ax, --ay), which is the
   shared transform-origin of every dolly layer, so the rise past the
   hat stays centered at any aspect ratio. */
function Voyager({ className }: { className?: string }) {
    const ink = '#223454';
    const skin = '#eab585';
    const skinShade = '#cf9260';
    const skinLit = '#f6cb9d';
    const rim = '#ffe9b0';
    return (
        <svg className={className} viewBox="0 0 320 360" aria-hidden="true">
            {/* == legs: wide, planted stance, cropped into the cloud bank == */}
            <path d="M116,317 C114,330 111,342 108,354 L136,354 C138,342 140,330 141,317 Z" fill={skin} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
            <path d="M130,317 C130,332 128,344 126,354 L136,354 C138,342 140,330 141,317 Z" fill={skinShade} />
            <path d="M204,317 C206,330 209,342 212,354 L184,354 C182,342 180,330 179,317 Z" fill={skin} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
            <path d="M190,317 C190,332 188,344 186,354 L184,354 C182,342 180,330 179,317 Z" fill={skinShade} />
            {/* boots, cropped by the frame / hidden by the bank */}
            <path d="M104,350 L140,350 L141,360 L102,360 Z" fill="#2b3a55" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M180,350 L216,350 L218,360 L179,360 Z" fill="#2b3a55" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />

            {/* == rolled sand shorts == */}
            <path
                d="M118,252 C112,272 112,290 118,306 L152,306 C155,290 157,274 160,260 C163,274 165,290 168,306 L202,306 C208,290 208,272 202,252 Z"
                fill="#d9c08c" stroke={ink} strokeWidth="3" strokeLinejoin="round"
            />
            <path d="M118,252 C112,272 112,290 118,306 L133,306 C127,288 127,268 131,254 Z" fill="#b39764" />
            <path d="M188,254 C192,272 193,290 191,306 L202,306 C208,290 208,272 202,252 Z" fill="#ecd9ac" opacity="0.85" />
            <path d="M153,296 C156,288 164,288 167,296 L168,306 L152,306 Z" fill="#b39764" opacity="0.7" />
            {/* rolled cuffs */}
            <rect x="110" y="302" width="48" height="15" rx="7" fill="#c3a874" stroke={ink} strokeWidth="3" />
            <rect x="114" y="310" width="40" height="5" rx="2.5" fill="#a8905e" />
            <rect x="162" y="302" width="48" height="15" rx="7" fill="#c3a874" stroke={ink} strokeWidth="3" />
            <rect x="166" y="310" width="40" height="5" rx="2.5" fill="#a8905e" />

            {/* == torso: indigo sleeveless top, back view == */}
            <path
                d="M122,148 C114,186 112,222 118,252 L202,252 C208,222 206,186 198,148 C184,138 170,134 160,134 C150,134 136,138 122,148 Z"
                fill="#2d5296" stroke={ink} strokeWidth="3" strokeLinejoin="round"
            />
            {/* cool shade panel down the left side */}
            <path d="M122,148 C114,186 112,222 118,252 L140,252 C133,214 133,174 138,150 Z" fill="#203d74" opacity="0.95" />
            {/* spine crease */}
            <path d="M162,156 C160,190 160,222 162,250" fill="none" stroke="#203d74" strokeWidth="3" opacity="0.5" strokeLinecap="round" />
            {/* lit tone across the sunward upper back */}
            <path d="M126,146 C140,136 180,136 194,146 L190,158 C176,148 144,148 130,158 Z" fill="#3f6cb9" opacity="0.9" />

            {/* == neck, in the hat's cool shadow == */}
            <path d="M151,124 L169,124 L171,138 C165,134 155,134 149,138 Z" fill={skin} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M151,124 L169,124 L170,130 L150,130 Z" fill={skinShade} />

            {/* == head: dark hair peeking below the brim == */}
            <circle cx="160" cy="112" r="17" fill="#2c241d" stroke={ink} strokeWidth="2.5" />
            <path d="M146,124 L141,133 L150,128 Z" fill="#2c241d" />
            <path d="M170,125 L177,133 L176,124 Z" fill="#2c241d" />
            <path d="M158,127 L160,135 L164,127 Z" fill="#2c241d" />
            <path d="M147,106 C152,101 168,101 173,106" fill="none" stroke="#4a3c2c" strokeWidth="2" opacity="0.8" strokeLinecap="round" />

            {/* == arms: raised in a triumphant V (ink halo, skin, cel
                   shade along the underside, warm rim on the sun edge) == */}
            <path d="M132,152 C104,122 76,80 62,40" fill="none" stroke={ink} strokeWidth="24" strokeLinecap="round" />
            <path d="M188,152 C216,122 244,80 258,40" fill="none" stroke={ink} strokeWidth="24" strokeLinecap="round" />
            <path d="M132,152 C104,122 76,80 62,40" fill="none" stroke={skin} strokeWidth="19" strokeLinecap="round" />
            <path d="M188,152 C216,122 244,80 258,40" fill="none" stroke={skin} strokeWidth="19" strokeLinecap="round" />
            <path d="M137,154 C111,126 85,86 67,42" fill="none" stroke={skinShade} strokeWidth="7" strokeLinecap="butt" opacity="0.9" />
            <path d="M183,154 C209,126 235,86 253,42" fill="none" stroke={skinShade} strokeWidth="7" strokeLinecap="butt" opacity="0.9" />
            <path d="M127.5,150 C101.5,122 75.5,82 57.5,38" fill="none" stroke={rim} strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />
            <path d="M192.5,150 C218.5,122 244.5,82 262.5,38" fill="none" stroke={rim} strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />

            {/* fists, clenched toward the sky */}
            <circle cx="60" cy="34" r="14" fill={ink} />
            <circle cx="60" cy="34" r="11" fill={skin} />
            <ellipse cx="58" cy="39" rx="8" ry="5" fill={skinShade} opacity="0.8" />
            <circle cx="54" cy="27" r="3" fill={skinLit} />
            <circle cx="60" cy="25.5" r="3" fill={skinLit} />
            <circle cx="66" cy="27" r="3" fill={skinLit} />
            <circle cx="260" cy="34" r="14" fill={ink} />
            <circle cx="260" cy="34" r="11" fill={skin} />
            <ellipse cx="262" cy="39" rx="8" ry="5" fill={skinShade} opacity="0.8" />
            <circle cx="254" cy="27" r="3" fill={skinLit} />
            <circle cx="260" cy="25.5" r="3" fill={skinLit} />
            <circle cx="266" cy="27" r="3" fill={skinLit} />

            {/* warm rim light across the shoulders */}
            <path d="M128,144 C144,133 176,133 192,144" fill="none" stroke={rim} strokeWidth="3" strokeLinecap="round" opacity="0.95" />

            {/* == the straw hat, worn: hero prop ==
                   Crown + band first, then the wide brim ring ON TOP
                   (underside visible from below-behind). */}
            {/* rounded crown */}
            <path
                d="M116,92 C114,52 134,26 160,24 C186,26 206,52 204,92 C188,102 132,102 116,92 Z"
                fill="#c99a4e" stroke={ink} strokeWidth="3" strokeLinejoin="round"
            />
            {/* lit upper dome */}
            <path d="M128,56 C132,36 144,28 160,27 C176,28 188,36 192,56 C178,47 142,47 128,56 Z" fill="#e3c07a" />
            {/* cool side shade steps */}
            <path d="M116,90 C114,66 118,46 128,34 C120,50 118,70 119,90 Z" fill="#9c7433" opacity="0.85" />
            <path d="M204,90 C206,66 202,46 192,34 C200,50 202,70 201,90 Z" fill="#9c7433" opacity="0.85" />
            {/* weave arcs */}
            <path d="M130,48 C146,56 174,56 190,48" fill="none" stroke="rgba(122, 90, 40, 0.45)" strokeWidth="1.6" />
            <path d="M124,64 C142,73 178,73 196,64" fill="none" stroke="rgba(122, 90, 40, 0.5)" strokeWidth="1.8" />
            {/* saturated blue hat-band */}
            <path d="M117,90 C134,100 186,100 203,90 L202,74 C186,84 134,84 118,74 Z" fill="#2f63b8" />
            <path d="M117,90 C134,100 186,100 203,90 L202.5,86 C186,95 134,95 117.5,86 Z" fill="#24498a" />
            {/* bright sunlit rim on the crown: warm cream then white,
                   the exact double-rim trick of the homepage clouds */}
            <path d="M134,32 C146,25 174,25 186,32" fill="none" stroke="#fff2cc" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M138,29.5 C148,25 172,25 182,29.5" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.92" />
            {/* wide brim: an annulus so the crown shows through the middle */}
            <path
                fillRule="evenodd"
                d="M98,96 a62,16 0 1,0 124,0 a62,16 0 1,0 -124,0 M116,96 a44,10 0 1,1 88,0 a44,10 0 1,1 -88,0"
                fill="#9c7433" stroke={ink} strokeWidth="3" strokeLinejoin="round"
            />
            {/* lit far edge of the brim (top arc) in stepped straw tones */}
            <path d="M102,90 A60,15 0 0 1 218,90" fill="none" stroke="#c99a4e" strokeWidth="6" />
            <path d="M103,88 A60,15 0 0 1 217,88" fill="none" stroke="#e3c07a" strokeWidth="3" />
            <path d="M104,86.5 A60,15 0 0 1 216,86.5" fill="none" stroke="#fff2cc" strokeWidth="2" opacity="0.9" />
            {/* weave rings on the shaded underside (bottom arcs) */}
            <path d="M108,100 A56,13 0 0 0 212,100" fill="none" stroke="rgba(70, 46, 14, 0.35)" strokeWidth="1.6" />
            <path d="M118,102 A46,10 0 0 0 202,102" fill="none" stroke="rgba(70, 46, 14, 0.3)" strokeWidth="1.4" />
        </svg>
    );
}

/* Tiny worn-straw-hat motif crowning the greeting. */
function HatMark({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 64 40" aria-hidden="true">
            <ellipse cx="32" cy="28" rx="28" ry="7.5" fill="#9c7433" />
            <ellipse cx="32" cy="26" rx="28" ry="7" fill="#c99a4e" />
            <path d="M14,26 Q16,6 32,5 Q48,6 50,26 Q32,32 14,26 Z" fill="#e3c07a" />
            <path d="M15,25 Q32,31 49,25 L48,19 Q32,25 16,19 Z" fill="#2f63b8" />
            <path d="M20,11 Q26,6.4 32,6" fill="none" stroke="#fff2cc" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
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
            {/* == the homepage daytime sky: zenith-to-horizon gradient,
                   oversized so the dolly can climb into deeper blue == */}
            <div className={styles.skyRig} aria-hidden="true">
                <div className={styles.sky} />
            </div>

            {/* == anchored sun: warm core, soft glow, faint god-rays == */}
            <div className={styles.light} aria-hidden="true">
                <span className={styles.sunGlow} />
                <span className={styles.godrays} />
                <span className={styles.sunCore} />
            </div>

            {/* == mid cumulus: corner-placed, they balloon and sweep
                   radially past the frame edges during the dolly == */}
            <div className={styles.midRig} aria-hidden="true">
                {MID_CLOUDS.map((c, i) => (
                    <CelCloud
                        key={i}
                        id={`wc-mid-${i}`}
                        className={styles.cel}
                        style={{ top: c.top, left: c.left, width: c.w, animationDelay: c.de, animationDuration: c.du }}
                    />
                ))}
            </div>

            {/* == the voyager: the camera climbs this figure and rises
                   past the raised hat crown == */}
            <div className={styles.figureRig} aria-hidden="true">
                <Voyager className={styles.voyager} />
            </div>

            {/* == sunlit cloud bank at the feet: falls away hard as the
                   camera lifts off == */}
            <div className={styles.bankRig} aria-hidden="true">
                {BANK.map((c, i) => (
                    <CelCloudWide
                        key={i}
                        id={`wc-bank-${i}`}
                        className={styles.cel}
                        style={{ bottom: c.bottom, left: c.left, width: c.w, animationDelay: c.de }}
                    />
                ))}
            </div>

            {/* == wisps: the fastest layer, whipping past the lens == */}
            <div className={styles.wispRig} aria-hidden="true">
                {WISPS.map((c, i) => (
                    <CelWisp
                        key={i}
                        id={`wc-wisp-${i}`}
                        className={styles.cel}
                        style={{ top: c.top, left: c.left, width: c.w, opacity: c.op }}
                    />
                ))}
            </div>

            {/* soft lens flares drifting off the sun, camera-space */}
            <span className={`${styles.flare} ${styles.flareA}`} aria-hidden="true" />
            <span className={`${styles.flare} ${styles.flareB}`} aria-hidden="true" />
            <span className={`${styles.flare} ${styles.flareC}`} aria-hidden="true" />

            {/* == emergence: open sky, fresh cumulus settle to rest == */}
            <div className={styles.emergeField} aria-hidden="true">
                {EMERGE.map((c, i) =>
                    c.wide ? (
                        <CelCloudWide key={i} id={`wc-em-${i}`} className={styles.cel} style={c.style} />
                    ) : (
                        <CelCloud key={i} id={`wc-em-${i}`} className={styles.cel} style={c.style} />
                    )
                )}
            </div>

            {/* rising light motes */}
            <div className={styles.sparkles} aria-hidden="true">
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
                            } as CSSProperties
                        }
                    />
                ))}
            </div>

            {/* airy edge haze, keeps the frame bright and hazy */}
            <div className={styles.haze} aria-hidden="true" />

            {/* warm bloom as the camera clears the hat crown */}
            <div className={styles.bloom} aria-hidden="true" />

            {/* == greeting, revealed in the open sky == */}
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
