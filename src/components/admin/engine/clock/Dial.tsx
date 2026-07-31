'use client';

/**
 * The 24-hour radial dial. Midnight at top, clockwise, ALL TIMES US EASTERN —
 * angles come from ET wall-clock minutes (et-time.ts), not from a UTC offset,
 * so the dial stays honest across the November DST shift.
 *
 * Pure presentation: every position is derived from the props. The drop hit
 * areas are the invisible `data-slot-iso` circles over each peak slot, which
 * useSlotDrag resolves with elementsFromPoint.
 */

import Bead, { type BeadPost } from './Bead';

export const VB = 300;               // viewBox size
const CX = VB / 2;
const CY = VB / 2;
const R_TICK = 132;
const R_RIM = 116;                   // Instagram peak-slot track
const R_KV = 92;                     // Facebook key-visual track (inner)
const R_ARC = 128;

export interface DialSlot {
    iso: string;        // exact UTC instant of this peak slot
    label: string;      // "Slot 2"
    time: string;       // "13:00" ET
    minutes: number;    // ET minutes past midnight
    occupantId: string | null;
    past: boolean;
}

export interface DialBead {
    post: BeadPost;
    minutes: number;
    kv: boolean;
    color: string;
    ring: number;       // stacking index for beads sharing a minute
}

/** Point on the dial for `minutes` past ET midnight at radius `r`. */
export function pointAt(minutes: number, r: number): { x: number; y: number } {
    const a = (minutes / 1440) * Math.PI * 2 - Math.PI / 2;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arcPath(fromMin: number, toMin: number, r: number): string {
    const a = pointAt(fromMin, r);
    const b = pointAt(toMin, r);
    const large = toMin - fromMin > 720 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export default function Dial({
    slots, beads, nowMinutes, overSlot, selectedId, onSlotClick, bindBead,
}: {
    slots: DialSlot[];
    beads: DialBead[];
    nowMinutes: number | null;   // null when the shown day is not today
    overSlot: string | null;
    selectedId: string | null;
    onSlotClick: (iso: string) => void;
    bindBead: (postId: string) => Record<string, unknown>;
}) {
    const now = nowMinutes == null ? null : pointAt(nowMinutes, R_TICK);

    return (
        <svg
            viewBox={`0 0 ${VB} ${VB}`}
            width="100%"
            style={{ display: 'block', maxWidth: 460, margin: '0 auto', touchAction: 'none', overflow: 'visible' }}
            role="img"
            aria-label="24-hour posting dial, Eastern time"
        >
            {/* field */}
            <circle cx={CX} cy={CY} r={R_TICK + 4} fill="var(--surface, #10161f)" opacity={0.55} />
            <circle cx={CX} cy={CY} r={R_RIM} fill="none" stroke="var(--line, #24303f)" strokeWidth={1} />
            <circle cx={CX} cy={CY} r={R_KV} fill="none" stroke="var(--line, #24303f)" strokeWidth={1} strokeDasharray="2 5" opacity={0.7} />

            {/* hour ticks — every hour, longer + labelled every 3 */}
            {Array.from({ length: 24 }, (_, h) => {
                const major = h % 3 === 0;
                const a = pointAt(h * 60, R_TICK);
                const b = pointAt(h * 60, major ? R_TICK - 9 : R_TICK - 4);
                const lbl = pointAt(h * 60, R_TICK + 11);
                return (
                    <g key={h}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line, #24303f)" strokeWidth={major ? 1.4 : 0.8} />
                        {major && (
                            <text
                                x={lbl.x} y={lbl.y}
                                textAnchor="middle" dominantBaseline="central"
                                fontSize={9} fill="var(--ink-3, #7d8ea3)"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                                {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* peak slot arcs — gold, tappable to edit the time, droppable */}
            {slots.map((s) => {
                const hot = overSlot === s.iso;
                return (
                    <g key={s.iso} opacity={s.past ? 0.4 : 1}>
                        <path
                            d={arcPath(s.minutes - 22, s.minutes + 22, R_ARC)}
                            fill="none"
                            stroke="var(--gold, #e6c489)"
                            strokeWidth={hot ? 9 : 5}
                            strokeLinecap="round"
                            opacity={hot ? 1 : 0.85}
                            style={{ filter: hot ? 'drop-shadow(0 0 7px var(--gold, #e6c489))' : undefined }}
                        />
                        {/* radial guide from arc to rim */}
                        <line
                            {...(() => { const a = pointAt(s.minutes, R_ARC - 5); const b = pointAt(s.minutes, R_KV); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; })()}
                            stroke="var(--gold, #e6c489)" strokeWidth={0.8} opacity={hot ? 0.7 : 0.25}
                        />
                        {/* drop target + click target (invisible, touch-sized) */}
                        <circle
                            data-slot-iso={s.iso}
                            cx={pointAt(s.minutes, R_ARC).x}
                            cy={pointAt(s.minutes, R_ARC).y}
                            r={22}
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onSlotClick(s.iso)}
                        >
                            <title>{`${s.label} · ${s.time} ET — tap to edit`}</title>
                        </circle>
                    </g>
                );
            })}

            {/* beads */}
            {beads.map((b) => {
                const r = (b.kv ? R_KV : R_RIM) - b.ring * 13;
                const p = pointAt(b.minutes, r);
                return (
                    <Bead
                        key={b.post.id}
                        x={p.x}
                        y={p.y}
                        color={b.color}
                        hollow={b.kv}
                        active={selectedId === b.post.id}
                        dim={false}
                        label={`${b.post.title} · ${b.post.post_score ?? '—'}/100${b.kv ? ' · key visual (Facebook)' : ''}`}
                        bind={bindBead(b.post.id)}
                    />
                );
            })}

            {/* now hand */}
            {now && (
                <>
                    <line
                        x1={CX} y1={CY} x2={now.x} y2={now.y}
                        stroke="var(--blue, #6fb2ff)" strokeWidth={1.6} strokeLinecap="round"
                        style={{ filter: 'drop-shadow(0 0 5px var(--blue, #6fb2ff))' }}
                    />
                    <circle cx={now.x} cy={now.y} r={3} fill="var(--blue, #6fb2ff)" />
                </>
            )}
            <circle cx={CX} cy={CY} r={3} fill="var(--gold, #e6c489)" opacity={0.8} />
        </svg>
    );
}
