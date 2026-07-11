import type { CSSProperties } from 'react';

/* ═══ ORIGINAL CEL-SHADED SVG ART ════════════════════════════════════
   Anime-style primitives built from clustered rounded shapes with crisp
   edges and stepped colour bands — no photographic blur anywhere.
   Every component takes a unique `id` (clipPath namespacing) so many
   instances can live on one page. All art is 100% original. */

interface ArtProps {
    id: string;
    className?: string;
    style?: CSSProperties;
}

type Lump = [number, number, number]; // cx, cy, r

/* ── Voluminous cel cumulus renderer ─────────────────────────────────
   Reference bar: the luminous, billowing anime cumulus of Shinkai / One
   Piece key art. Volume comes from a STACK of stepped tone layers (dark
   underside → light body) whose circles follow each lump, plus valley
   shadows that separate the billows, a warm sunlit rim on the sun-facing
   (upper) edge, and cool blue-grey undersides. Crisp steps, not blur. */
function CloudBody({
    clip,
    lumps,
    w,
    h,
}: {
    clip: string;
    lumps: Lump[];
    w: number;
    h: number;
}) {
    // Stepped shading: each step raises the lump circles a little and
    // lightens the fill, so the lower rim of every billow shows the
    // cooler tone beneath it — reads as rounded, sunlit volume.
    const steps: { dy: number; r: number; fill: string }[] = [
        { dy: -5, r: 1.0, fill: '#c2dbf6' },
        { dy: -13, r: 0.99, fill: '#dcecfd' },
        { dy: -22, r: 0.99, fill: '#f2f8ff' },
        { dy: -31, r: 0.97, fill: '#ffffff' }, // lit body crown
    ];

    // Valley shadows: darker circles in the dips between adjacent lumps,
    // to carve visible separation between billows.
    const valleys = lumps.slice(0, -1).map(([x1, y1, r1], i) => {
        const [x2, y2, r2] = lumps[i + 1];
        const cx = (x1 + x2) / 2;
        const cy = Math.max(y1, y2) + Math.min(r1, r2) * 0.15;
        const r = Math.min(r1, r2) * 0.62;
        return [cx, cy, r] as Lump;
    });

    return (
        <g clipPath={`url(#${clip})`}>
            <rect x="0" y="0" width={w} height={h} fill="#a9cbee" />
            {steps.slice(0, 2).map((s, si) =>
                lumps.map(([cx, cy, r], i) => (
                    <circle key={`s${si}-${i}`} cx={cx} cy={cy + s.dy} r={r * s.r} fill={s.fill} />
                ))
            )}
            {/* billow-separating valley shadows sit under the lit body */}
            {valleys.map(([cx, cy, r], i) => (
                <circle key={`v-${i}`} cx={cx} cy={cy} r={r} fill="#c2dbf6" />
            ))}
            {steps.slice(2).map((s, si) =>
                lumps.map(([cx, cy, r], i) => (
                    <circle key={`t${si}-${i}`} cx={cx} cy={cy + s.dy} r={r * s.r} fill={s.fill} />
                ))
            )}
            {/* warm sunlit rim — cream crescent peeking above the white crown */}
            {lumps.map(([cx, cy, r], i) => (
                <circle key={`rim-${i}`} cx={cx + r * 0.1} cy={cy - 40} r={r * 0.95} fill="#fff2cc" />
            ))}
            {lumps.map(([cx, cy, r], i) => (
                <circle key={`rimw-${i}`} cx={cx + r * 0.1} cy={cy - 34} r={r * 0.95} fill="#ffffff" />
            ))}
            {/* soft top sheen highlight on the biggest lumps */}
            {lumps
                .filter((l) => l[2] >= 40)
                .map(([cx, cy, r], i) => (
                    <circle key={`sh-${i}`} cx={cx - r * 0.14} cy={cy - r * 0.42} r={r * 0.34} fill="#ffffff" opacity="0.85" />
                ))}
        </g>
    );
}

/** Rounded, billowing 5-lump cumulus. */
export function CelCloud({ id, className, style }: ArtProps) {
    const cid = `sky-cloud-${id}`;
    const w = 264;
    const h = 150;
    const lumps: Lump[] = [
        [48, 100, 30],
        [96, 70, 44],
        [146, 54, 50],
        [196, 72, 41],
        [230, 100, 28],
    ];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className={className} style={style} aria-hidden="true">
            <defs>
                <clipPath id={cid}>
                    {lumps.map(([cx, cy, r], i) => (
                        <circle key={i} cx={cx} cy={cy} r={r} />
                    ))}
                    {/* solid core bridge — fills the body between lobes so
                        NO sky shows through the interior (only the crown
                        edge keeps its billow separations) */}
                    <rect x="40" y="58" width="190" height="86" rx="34" />
                    <rect x="20" y="96" width="228" height="46" rx="23" />
                </clipPath>
            </defs>
            <CloudBody clip={cid} lumps={lumps} w={w} h={h} />
        </svg>
    );
}

/** Long, billowing 7-lump cumulus bank for wide foreground sweeps. */
export function CelCloudWide({ id, className, style }: ArtProps) {
    const cid = `sky-cloudw-${id}`;
    const w = 430;
    const h = 158;
    const lumps: Lump[] = [
        [48, 116, 32],
        [98, 86, 44],
        [156, 62, 52],
        [222, 54, 54],
        [286, 68, 48],
        [344, 88, 40],
        [390, 114, 30],
    ];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className={className} style={style} aria-hidden="true">
            <defs>
                <clipPath id={cid}>
                    {lumps.map(([cx, cy, r], i) => (
                        <circle key={i} cx={cx} cy={cy} r={r} />
                    ))}
                    {/* solid core bridge — keeps the interior fully opaque */}
                    <rect x="44" y="58" width="352" height="98" rx="40" />
                    <rect x="20" y="110" width="392" height="46" rx="23" />
                </clipPath>
            </defs>
            <CloudBody clip={cid} lumps={lumps} w={w} h={h} />
        </svg>
    );
}

/** Slim, low-profile cel cumulus — the light cloud streaks that whip
    past during the dolly-in. Same fluffy, fully-shaded cumulus quality
    as the big ones (no flat bars), just wider and flatter. */
export function CelWisp({ id, className, style }: ArtProps) {
    const cid = `sky-wisp-${id}`;
    const w = 300;
    const h = 96;
    const lumps: Lump[] = [
        [42, 66, 20],
        [94, 52, 30],
        [152, 46, 34],
        [214, 52, 29],
        [266, 66, 19],
    ];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className={className} style={style} aria-hidden="true">
            <defs>
                <clipPath id={cid}>
                    {lumps.map(([cx, cy, r], i) => (
                        <circle key={i} cx={cx} cy={cy} r={r} />
                    ))}
                    <rect x="40" y="50" width="220" height="42" rx="21" />
                    <rect x="26" y="66" width="248" height="26" rx="13" />
                </clipPath>
            </defs>
            <CloudBody clip={cid} lumps={lumps} w={w} h={h} />
        </svg>
    );
}

/** Distant original island: layered teal silhouettes + a tiny peak. */
export function Island({ id, className, style }: ArtProps) {
    void id;
    return (
        <svg viewBox="0 0 220 70" className={className} style={style} aria-hidden="true">
            {/* mound tapering to the waterline inside the frame */}
            <path
                d="M8,70 Q42,64 62,48 Q86,26 110,22 Q138,26 160,46 Q182,63 212,70 Z"
                fill="#1c6fa8"
            />
            <path
                d="M56,70 Q86,52 112,46 Q142,50 172,70 Z"
                fill="#155a8f"
            />
            <path d="M96,38 L110,16 L126,38 Q110,30 96,38 Z" fill="#134f80" />
        </svg>
    );
}

/** Tiny far-off sailboat silhouette (generic, original). */
export function Sailboat({ id, className, style }: ArtProps) {
    void id;
    return (
        <svg viewBox="0 0 60 54" className={className} style={style} aria-hidden="true">
            {/* hull */}
            <path d="M6,42 L54,42 L46,52 L14,52 Z" fill="#12395f" />
            {/* mast */}
            <rect x="29" y="8" width="2.6" height="34" fill="#12395f" />
            {/* main sail */}
            <path d="M33,8 Q52,24 34,40 L33,40 Z" fill="#ffffff" />
            <path d="M33,30 Q45,32 34,40 L33,40 Z" fill="#d9ecfb" />
            {/* jib */}
            <path d="M27,14 Q12,26 26,40 L27,40 Z" fill="#f2f9ff" />
            {/* pennant */}
            <path d="M31,8 L31,3 L42,5.5 L31,8 Z" fill="#ff9f3e" />
        </svg>
    );
}

/** Anime shorthand birds — a small flock of gull silhouettes whose
    wings FLAP: each wing is its own stroke, pivoting at the shoulder
    (0,0 of the bird group) via a rotate cycle. Flap phase is staggered
    per bird so the flock isn't synced. `animate=false` (reduced motion)
    freezes them mid-glide. */
export function Birds({ id, className, style, animate = true }: ArtProps & { animate?: boolean }) {
    void id;
    // {x, y, scale, flap-phase offset (s)}
    const flock: [number, number, number, number][] = [
        [22, 22, 1.0, 0],
        [64, 30, 0.78, -0.34],
        [100, 15, 0.9, -0.66],
    ];
    const dur = 0.9;
    const spl = '0.4 0 0.6 1;0.4 0 0.6 1';
    return (
        <svg viewBox="0 0 132 44" className={className} style={style} aria-hidden="true">
            {flock.map(([x, y, s, ph], i) => (
                <g
                    key={i}
                    transform={`translate(${x} ${y}) scale(${s})`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={3.4}
                    strokeLinecap="round"
                >
                    {/* left wing */}
                    <path d="M0,0 Q-9,-9 -19,-3">
                        {animate ? (
                            <animateTransform
                                attributeName="transform"
                                type="rotate"
                                dur={`${dur}s`}
                                begin={`${ph}s`}
                                calcMode="spline"
                                keyTimes="0;0.5;1"
                                keySplines={spl}
                                values="-15 0 0; 13 0 0; -15 0 0"
                                repeatCount="indefinite"
                            />
                        ) : null}
                    </path>
                    {/* right wing */}
                    <path d="M0,0 Q9,-9 19,-3">
                        {animate ? (
                            <animateTransform
                                attributeName="transform"
                                type="rotate"
                                dur={`${dur}s`}
                                begin={`${ph}s`}
                                calcMode="spline"
                                keyTimes="0;0.5;1"
                                keySplines={spl}
                                values="15 0 0; -13 0 0; 15 0 0"
                                repeatCount="indefinite"
                            />
                        ) : null}
                    </path>
                </g>
            ))}
        </svg>
    );
}

/** Full moon — cool disc with soft craters, for night mode. */
export function Moon({ id, className, style }: ArtProps) {
    const gid = `sky-moon-${id}`;
    return (
        <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
            <defs>
                <radialGradient id={gid} cx="42%" cy="38%" r="68%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="52%" stopColor="#eaf1fb" />
                    <stop offset="100%" stopColor="#c7d6ec" />
                </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill={`url(#${gid})`} />
            {/* craters — cool stepped shading, crisp */}
            <circle cx="38" cy="40" r="8" fill="#d3e0f2" />
            <circle cx="38" cy="40" r="5.4" fill="#c4d4ea" />
            <circle cx="64" cy="56" r="10.5" fill="#d3e0f2" />
            <circle cx="64" cy="56" r="7" fill="#c4d4ea" />
            <circle cx="53" cy="72" r="5.5" fill="#d3e0f2" />
            <circle cx="70" cy="34" r="4.4" fill="#d3e0f2" />
            <circle cx="30" cy="62" r="4" fill="#d3e0f2" />
            {/* cool sunlit rim on the upper-left */}
            <circle cx="46" cy="46" r="45" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.6" />
        </svg>
    );
}

/* ═══ LIVING WATER — trochoidal cel swells ═══════════════════════════
   Each crest line is sampled at FIXED x columns and joined by a smooth
   Catmull-Rom → cubic-Bézier spline (C commands), so the silhouette is a
   continuous flowing curve with NO polyline kinks. The height profile is
   a gentle Gerstner/Stokes-style trochoid: in-phase harmonics on the
   primary swell sharpen the crests and broaden/flatten the troughs, a
   slower long-period ground swell modulates the chop at its own travel
   speed (so successive crests are never identical humps), and a small
   fast chop hurries across the swell faces. Because the sample x's never
   move, advancing `phase` makes every column rise and fall while the
   peaks travel sideways → crests genuinely ROLL, they don't slide as a
   rigid shape. A SMIL <animate> morphs the path `d` through one full
   phase cycle at WAVE_FRAMES resolution (first frame === last → seamless
   loop; every phase multiplier is an integer so all terms return home).
   Motion = path morph only (+ a gentle vertical surge on the layer in
   CSS); reduced motion renders the static first frame, which is the same
   smooth spline. */
const WAVE_SAMPLES = 36;
const WAVE_FRAMES = 24;
const WAVE_W = 3000;

function crestY(x: number, base: number, amp: number, period: number, phase: number): number {
    const t1 = (2 * Math.PI * x) / period + phase;
    // primary swell — Stokes harmonics IN PHASE with the fundamental:
    // crests pinch up slightly, troughs sit broad and calm (trochoid)
    const swell = Math.cos(t1) + 0.26 * Math.cos(2 * t1) + 0.07 * Math.cos(3 * t1);
    // long-period ground swell travelling at its own speed — lifts and
    // lowers whole stretches of sea so no two crests match
    const ground = 0.34 * Math.cos((2 * Math.PI * x) / (period * 2.13) + phase + 1.9);
    // short chop running faster across the swell faces
    const chop = 0.11 * Math.cos((2 * Math.PI * x) / (period * 0.47) + 2 * phase + 0.6);
    return base - amp * (0.66 * swell + ground + chop);
}

/** Smooth crest silhouette: Catmull-Rom through the fixed-x samples,
    emitted as cubic Béziers. Phantom samples one step past each edge
    give correct end tangents (crestY is analytic, so we just evaluate
    off-canvas). Every frame emits an identical command structure, which
    SMIL needs to interpolate the morph. */
function crestPath(base: number, amp: number, period: number, phase: number, h: number): string {
    const step = WAVE_W / WAVE_SAMPLES;
    const pts: [number, number][] = [];
    for (let i = -1; i <= WAVE_SAMPLES + 1; i++) {
        const x = i * step;
        pts.push([x, crestY(x, base, amp, period, phase)]);
    }
    let d = `M0,${pts[1][1].toFixed(1)}`;
    for (let i = 1; i <= WAVE_SAMPLES; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const [x3, y3] = pts[i + 2];
        const c1x = x1 + (x2 - x0) / 6;
        const c1y = y1 + (y2 - y0) / 6;
        const c2x = x2 - (x3 - x1) / 6;
        const c2y = y2 - (y3 - y1) / 6;
        d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    return `${d} L${WAVE_W},${h} L0,${h} Z`;
}

/** Phase-cycle keyframe list for SMIL `values` (first frame === last for
    a seamless loop). `dir` reverses the roll direction; `phase0` offsets
    the whole cycle so stacked bands/rims don't crest in lockstep. */
function crestValues(
    base: number,
    amp: number,
    period: number,
    h: number,
    dir: number,
    phase0 = 0
): string {
    const frames: string[] = [];
    for (let f = 0; f <= WAVE_FRAMES; f++) {
        frames.push(crestPath(base, amp, period, phase0 + (dir * 2 * Math.PI * f) / WAVE_FRAMES, h));
    }
    return frames.join(';');
}

function MorphWave({
    values,
    dur,
    fill,
    opacity,
    animate,
}: {
    values: string;
    dur: number;
    fill: string;
    opacity?: number;
    animate: boolean;
}) {
    return (
        <path d={values.slice(0, values.indexOf(';'))} fill={fill} opacity={opacity}>
            {animate ? (
                <animate attributeName="d" dur={`${dur}s`} values={values} repeatCount="indefinite" />
            ) : null}
        </path>
    );
}

/** One rolling cel wave band: a receding deep swell (opposite roll for
    depth), a bright cel foam rim, and the flat body colour — all
    undulating as living water. `shift` offsets the whole band's phase so
    stacked parallax bands never crest in lockstep. The foam rim leads the
    body by a small phase (+0.18 rad ≈ 28px of travel), so the rim sits
    thick on the advancing crest face and thins off the back — the gap
    breathes between ~4 and ~28 units but never vanishes. */
export function WaveBand({
    id,
    className,
    style,
    body,
    crest,
    deep,
    dur = 11,
    shift = 0,
    animate = true,
    animateBack,
}: ArtProps & {
    body: string;
    crest: string;
    deep?: string;
    dur?: number;
    shift?: number;
    animate?: boolean;
    animateBack?: boolean; // deep back-swell morph; defaults to `animate`. Set false on mobile to trim cost.
}) {
    void id;
    const H = 400;
    const period = 980;
    const amp = 46;
    const animBack = animateBack ?? animate;
    const bodyVals = crestValues(108, amp, period, H, 1, shift);
    const foamVals = crestValues(92, amp, period, H, 1, shift + 0.18); // rim leads the crest
    const backVals = deep ? crestValues(150, amp * 0.66, period * 1.36, H, -1, shift + 2.4) : '';
    return (
        <svg viewBox="0 0 3000 400" preserveAspectRatio="none" className={className} style={style} aria-hidden="true">
            {deep ? <MorphWave values={backVals} dur={dur * 1.35} fill={deep} opacity={0.9} animate={animBack} /> : null}
            <MorphWave values={foamVals} dur={dur} fill={crest} animate={animate} />
            <MorphWave values={bodyVals} dur={dur} fill={body} animate={animate} />
        </svg>
    );
}

/** The undulating HORIZON crest where the sea meets the sky (transparent
    above → sky shows through the scallops), a bright cel foam rim and a
    cool shade band beneath for stepped depth. Also living, rolling water. */
export function SeaCrest({
    id,
    className,
    style,
    body,
    foam,
    dur = 17,
    animate = true,
}: ArtProps & { body: string; foam: string; dur?: number; animate?: boolean }) {
    void id;
    const H = 200;
    const period = 1120;
    const amp = 26;
    const foamVals = crestValues(48, amp, period, H, 1, 0.14); // rim leads the crest
    const bodyVals = crestValues(60, amp, period, H, 1);
    const shadeVals = crestValues(96, amp * 0.7, period, H, 1, 0.5);
    return (
        <svg viewBox="0 0 3000 200" preserveAspectRatio="none" className={className} style={style} aria-hidden="true">
            <MorphWave values={foamVals} dur={dur} fill={foam} animate={animate} />
            <MorphWave values={bodyVals} dur={dur} fill={body} animate={animate} />
            <MorphWave values={shadeVals} dur={dur} fill="rgba(10, 64, 128, 0.16)" animate={animate} />
        </svg>
    );
}
