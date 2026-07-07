import type { CSSProperties } from 'react';

/* ═══ CONTENT-SKY CEL ART ════════════════════════════════════════════
   Self-contained copies of the cel-shaded cumulus + moon primitives from
   the /redesign-sky preview (src/components/redesign-sky/art.tsx), so the
   reusable content-page sky theme has ZERO dependency on the preview
   folder. Crisp stepped colour bands, no photographic blur. Every
   component takes a unique `id` (clipPath namespacing, prefixed `skyc-`
   so it can never collide with the landing preview's ids). */

interface ArtProps {
    id: string;
    className?: string;
    style?: CSSProperties;
}

type Lump = [number, number, number]; // cx, cy, r

/* Voluminous cel cumulus renderer — a stack of stepped tone layers
   (dark underside → lit crown), valley shadows between billows, and a
   warm sunlit rim. */
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
    const steps: { dy: number; r: number; fill: string }[] = [
        { dy: -5, r: 1.0, fill: '#c2dbf6' },
        { dy: -13, r: 0.99, fill: '#dcecfd' },
        { dy: -22, r: 0.99, fill: '#f2f8ff' },
        { dy: -31, r: 0.97, fill: '#ffffff' }, // lit body crown
    ];

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
            {valleys.map(([cx, cy, r], i) => (
                <circle key={`v-${i}`} cx={cx} cy={cy} r={r} fill="#c2dbf6" />
            ))}
            {steps.slice(2).map((s, si) =>
                lumps.map(([cx, cy, r], i) => (
                    <circle key={`t${si}-${i}`} cx={cx} cy={cy + s.dy} r={r * s.r} fill={s.fill} />
                ))
            )}
            {lumps.map(([cx, cy, r], i) => (
                <circle key={`rim-${i}`} cx={cx + r * 0.1} cy={cy - 40} r={r * 0.95} fill="#fff2cc" />
            ))}
            {lumps.map(([cx, cy, r], i) => (
                <circle key={`rimw-${i}`} cx={cx + r * 0.1} cy={cy - 34} r={r * 0.95} fill="#ffffff" />
            ))}
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
    const cid = `skyc-cloud-${id}`;
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
                    {/* solid core bridge — keeps the interior fully opaque */}
                    <rect x="40" y="58" width="190" height="86" rx="34" />
                    <rect x="20" y="96" width="228" height="46" rx="23" />
                </clipPath>
            </defs>
            <CloudBody clip={cid} lumps={lumps} w={w} h={h} />
        </svg>
    );
}

/** Long, billowing 7-lump cumulus bank for wide sweeps. */
export function CelCloudWide({ id, className, style }: ArtProps) {
    const cid = `skyc-cloudw-${id}`;
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
                    <rect x="44" y="58" width="352" height="98" rx="40" />
                    <rect x="20" y="110" width="392" height="46" rx="23" />
                </clipPath>
            </defs>
            <CloudBody clip={cid} lumps={lumps} w={w} h={h} />
        </svg>
    );
}

/** Full moon — cool disc with soft craters, for night mode. */
export function Moon({ id, className, style }: ArtProps) {
    const gid = `skyc-moon-${id}`;
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
            <circle cx="38" cy="40" r="8" fill="#d3e0f2" />
            <circle cx="38" cy="40" r="5.4" fill="#c4d4ea" />
            <circle cx="64" cy="56" r="10.5" fill="#d3e0f2" />
            <circle cx="64" cy="56" r="7" fill="#c4d4ea" />
            <circle cx="53" cy="72" r="5.5" fill="#d3e0f2" />
            <circle cx="70" cy="34" r="4.4" fill="#d3e0f2" />
            <circle cx="30" cy="62" r="4" fill="#d3e0f2" />
            <circle cx="46" cy="46" r="45" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.6" />
        </svg>
    );
}
