'use client';

import { memo } from 'react';
import type { BlueprintNode } from '@/lib/engine/blueprint';
import type { Placed, ClusterMark } from './layout';
import { R, SCENE } from './layout';
import type { EdgeGeom } from './geometry';
import { pointAt } from './geometry';

/**
 * Canvas layers.
 *
 * Split into memoized layers on purpose. The animation loop re-renders roughly
 * 30 times a second, and only the light layers depend on the frame clock. Nodes
 * and edges re-render only when the DATA changes, which is what keeps a
 * permanently-animating scene affordable.
 *
 * Visual language: flat editorial data-viz, not skeuomorphic. Shapes are solid
 * and unshaded; depth comes from overlap, scale and transparency rather than
 * from gloss. Connections are wide, soft, flowing ribbons — the eye should be
 * able to follow one strand of traffic across the whole picture.
 */

export type NodeState = 'idle' | 'good' | 'warn' | 'crit' | 'stalled' | 'unknown';

/**
 * Two colour channels, deliberately separated.
 *
 * KIND says what a thing IS and never changes. STATE says how it is DOING and
 * lives in the halo and the state ring.
 *
 * An early version used state for the node fill, and with no telemetry yet
 * every node rendered the same idle grey — a live system that looked dead, and
 * a picture that told you nothing until the first cron fired. Identity is
 * always knowable, so identity gets the fill.
 *
 * These read from CSS custom properties so the light and dark themes can carry
 * genuinely different palettes rather than one washed-out compromise.
 */
const KIND_COLOR: Record<string, string> = {
    core: 'var(--j-core-c)',
    stage: 'var(--j-stage-c)',
    worker: 'var(--j-worker-c)',
    surface: 'var(--j-surface-c)',
    source: 'var(--j-source-c)',
    external: 'var(--j-external-c)',
    store: 'var(--j-store-c)',
};

const STATE_COLOR: Record<NodeState, string> = {
    idle: 'var(--j-idle)',
    good: 'var(--j-good)',
    warn: 'var(--j-warn)',
    crit: 'var(--j-crit)',
    stalled: 'var(--j-warn)',
    unknown: 'var(--j-idle)',
};

/**
 * How loudly the halo argues. Unknown must not look like confident health.
 *
 * Idle and unknown are deliberately almost invisible. On the dark theme a faint
 * grey halo reads as ambient glow; on the light theme the same value reads as a
 * smudge behind every node, and fifty of them turn an airy diagram muddy. A
 * node with nothing to report should say nothing.
 */
const STATE_HALO_OPACITY: Record<NodeState, number> = {
    idle: 0.05,
    unknown: 0.04,
    good: 0.16,
    warn: 0.3,
    crit: 0.42,
    stalled: 0.3,
};

// ── Scene furniture ─────────────────────────────────────────────

export function Defs() {
    return (
        <defs>
            <filter id="j-glow" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
            <filter id="j-soft" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="14" />
            </filter>
            <radialGradient id="j-core" cx="50%" cy="50%">
                <stop offset="0%" stopColor="var(--j-core-c)" stopOpacity="0.55" />
                <stop offset="60%" stopColor="var(--j-core-c)" stopOpacity="0.12" />
                <stop offset="100%" stopColor="var(--j-core-c)" stopOpacity="0" />
            </radialGradient>
        </defs>
    );
}

/**
 * Soft concentric bands and the outer dot field.
 *
 * The bands carry no data — they exist so the radial arrangement reads as
 * deliberate structure rather than a cloud of dots. Without them a viewer has
 * no way to tell that distance from the centre means anything.
 */
export const RingGuides = memo(function RingGuides({
    dots, dim,
}: { dots: { x: number; y: number; r: number; o: number }[]; dim: boolean }) {
    const bands = [R.outer + 26, R.edge + 6, R.worker + 4];
    return (
        <g aria-hidden="true" opacity={dim ? 0.35 : 1}>
            {bands.map((r, i) => (
                <circle key={r} cx={SCENE.cx} cy={SCENE.cy} r={r}
                    fill="var(--j-band)" opacity={0.55 + i * 0.22} />
            ))}
            {bands.map((r) => (
                <circle key={`s-${r}`} cx={SCENE.cx} cy={SCENE.cy} r={r}
                    fill="none" stroke="var(--j-band-line)" strokeWidth={1} />
            ))}
            {dots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="var(--j-fleck)" opacity={d.o} />
            ))}
        </g>
    );
});

// ── Edges ───────────────────────────────────────────────────────

/**
 * Flowing ribbons.
 *
 * Width encodes structural weight: the pipeline spine is a wide band, a single
 * RSS feed reaching detection is a thread. Drawn with round caps and low
 * opacity so overlapping strands build depth by accumulation, the way ink does,
 * instead of fighting each other.
 */
export const EdgeLayer = memo(function EdgeLayer({
    edges, litIds, hasFocus, widthOf, colourOf,
}: {
    edges: EdgeGeom[];
    litIds: Set<string>;
    hasFocus: boolean;
    widthOf: (e: EdgeGeom) => number;
    colourOf: (e: EdgeGeom) => string;
}) {
    return (
        <g aria-hidden="true" style={{ mixBlendMode: 'var(--j-edge-blend)' as never }}>
            {edges.map((e) => {
                const lit = !hasFocus || (litIds.has(e.from) && litIds.has(e.to));
                const w = widthOf(e);
                return (
                    <path
                        key={e.key}
                        d={e.d}
                        className={`j-edge ${hasFocus && lit ? 'j-edge--active' : ''} ${hasFocus && !lit ? 'j-edge--dimmed' : ''}`}
                        stroke={colourOf(e)}
                        strokeWidth={hasFocus && lit ? w * 1.5 : w}
                        strokeLinecap="round"
                    />
                );
            })}
        </g>
    );
});

// ── Ambient carrier particles ───────────────────────────────────

/**
 * The baseline "the system is alive" motion: faint motes drifting along every
 * edge even when nothing is firing.
 *
 * Position is a pure function of (time, edge index), so there is no
 * per-particle state to store or update — the whole layer is recomputed from
 * the clock each frame. Particle count scales with edge count and is capped, so
 * a big graph on a small phone doesn't melt.
 */
export const ParticleLayer = memo(function ParticleLayer({
    edges, t, dense,
}: { edges: EdgeGeom[]; t: number; dense: boolean }) {
    const per = dense ? 2 : 1;
    const dots: React.ReactElement[] = [];

    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        for (let k = 0; k < per; k++) {
            const phase = ((t / (7000 + (i % 5) * 900)) + (i * 0.137 + k * 0.5)) % 1;
            const p = pointAt(e, phase);
            dots.push(
                <circle
                    key={`${e.key}-${k}`}
                    cx={p.x}
                    cy={p.y}
                    r={1.7}
                    fill="var(--j-mote)"
                    opacity={0.34 * Math.sin(Math.PI * phase)}
                />,
            );
        }
    }
    return <g aria-hidden="true">{dots}</g>;
});

// ── Run pulses ──────────────────────────────────────────────────

export interface Pulse {
    id: string;
    edgeKey: string;
    /** performance.now() when it started. */
    start: number;
    duration: number;
    ok: boolean;
}

/**
 * A bright packet travelling an edge because a worker actually ran. This is the
 * one animation that carries information rather than atmosphere, so it is
 * deliberately much brighter and faster than the ambient drift.
 */
export const PulseLayer = memo(function PulseLayer({
    pulses, edgeIndex, t,
}: { pulses: Pulse[]; edgeIndex: Map<string, EdgeGeom>; t: number }) {
    return (
        <g aria-hidden="true">
            {pulses.map((p) => {
                const e = edgeIndex.get(p.edgeKey);
                if (!e) return null;
                const prog = (t - p.start) / p.duration;
                if (prog < 0 || prog > 1) return null;
                const pt = pointAt(e, prog);
                const colour = p.ok ? 'var(--j-pulse)' : 'var(--j-crit)';
                const fade = Math.sin(Math.PI * prog);
                // A short comet tail reads as direction; a bare dot doesn't.
                const tail = pointAt(e, Math.max(0, prog - 0.05));
                return (
                    <g key={p.id} opacity={fade}>
                        <line x1={tail.x} y1={tail.y} x2={pt.x} y2={pt.y}
                            stroke={colour} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
                        <circle cx={pt.x} cy={pt.y} r={10} fill={colour} opacity={0.15} />
                        <circle cx={pt.x} cy={pt.y} r={3.4} fill={colour} />
                    </g>
                );
            })}
        </g>
    );
});

// ── Constellation marks ─────────────────────────────────────────

/**
 * The soft disc behind a cluster of sources.
 *
 * Discs only — the labels ride in ClusterLabels, drawn ABOVE the nodes. Kept in
 * one layer they were painted before the node layer and the edges, so a cluster
 * label sitting anywhere near a node simply vanished under it.
 */
export const ClusterLayer = memo(function ClusterLayer({
    clusters, dim,
}: { clusters: ClusterMark[]; dim: boolean }) {
    return (
        <g aria-hidden="true" opacity={dim ? 0.25 : 1}>
            {clusters.map((c) => (
                <g key={c.key}>
                    <circle cx={c.x} cy={c.y} r={c.r + 24} fill="var(--j-cluster)" />
                    <circle cx={c.x} cy={c.y} r={c.r + 24} fill="none"
                        stroke="var(--j-cluster-line)" strokeWidth={1} strokeDasharray="3 6" />
                </g>
            ))}
        </g>
    );
});

export const ClusterLabels = memo(function ClusterLabels({
    clusters, dim,
}: { clusters: ClusterMark[]; dim: boolean }) {
    return (
        <g aria-hidden="true" opacity={dim ? 0.25 : 1}>
            {clusters.map((c) => {
                // Push the chip OUTWARD along the cluster's own radius rather
                // than straight up. Straight up walks it back toward the worker
                // ring, where it lands on top of a worker's label; outward is
                // always open space.
                const dx = c.x - SCENE.cx;
                const dy = c.y - SCENE.cy;
                const len = Math.hypot(dx, dy) || 1;
                return (
                    <Chip
                        key={c.key}
                        x={c.x + (dx / len) * (c.r + 40)}
                        y={c.y + (dy / len) * (c.r + 40)}
                        angle={0}
                        text={`${c.label} · ${c.count}`}
                        tone="source"
                    />
                );
            })}
        </g>
    );
});

// ── Labels ──────────────────────────────────────────────────────

/**
 * A rounded label chip.
 *
 * Width is estimated from character count rather than measured. Measuring text
 * in SVG needs getBBox, which forces layout and — worse — returns different
 * numbers on the server and the client, guaranteeing a hydration mismatch on a
 * server-rendered page.
 */
export function Chip({
    x, y, angle, text, tone, anchor = 'middle',
}: {
    x: number; y: number; angle: number; text: string;
    tone: 'source' | 'surface' | 'external' | 'store';
    anchor?: 'start' | 'middle' | 'end';
}) {
    const w = text.length * 5.9 + 14;
    const h = 17;
    const dx = anchor === 'start' ? 0 : anchor === 'end' ? -w : -w / 2;
    return (
        <g transform={angle ? `rotate(${angle} ${x} ${y})` : undefined} pointerEvents="none">
            <rect
                x={x + dx} y={y - h / 2} width={w} height={h} rx={5}
                fill={`var(--j-chip-${tone})`}
            />
            <text
                x={x + dx + w / 2} y={y + 4}
                textAnchor="middle"
                className="j-chip__text"
            >
                {text}
            </text>
        </g>
    );
}

// ── Nodes ───────────────────────────────────────────────────────

function labelAnchor(angle: number): 'start' | 'middle' | 'end' {
    if (angle > 15 && angle < 165) return 'start';
    if (angle > 195 && angle < 345) return 'end';
    return 'middle';
}

/** Keep perimeter chips upright rather than upside-down on the left half. */
function radialAngle(angle: number): number {
    const a = ((angle % 360) + 360) % 360;
    return a > 180 ? a + 90 : a - 90;
}

const CHIP_TONE: Record<string, 'source' | 'surface' | 'external' | 'store'> = {
    source: 'source', surface: 'surface', external: 'external', store: 'store',
};

export const NodeLayer = memo(function NodeLayer({
    placed, states, litIds, hasFocus, focusId, onFocus, agentNodeIds, pingIds,
}: {
    placed: Placed[];
    states: Map<string, NodeState>;
    litIds: Set<string>;
    hasFocus: boolean;
    focusId: string | null;
    onFocus: (id: string) => void;
    agentNodeIds: Set<string>;
    /** Nodes whose worker ran in the last few minutes — they emit a radar ping. */
    pingIds: Set<string>;
}) {
    return (
        <g>
            {placed.map((p, i) => {
                const n: BlueprintNode = p.node;
                const state = states.get(n.id) ?? 'unknown';
                const kindColour = KIND_COLOR[n.kind] ?? 'var(--j-idle)';
                const stateColour = STATE_COLOR[state];
                // A node in trouble abandons its identity colour — a red node
                // must be unmissable, and that outranks the kind legend.
                const alarmed = state === 'crit' || state === 'warn' || state === 'stalled';
                const colour = alarmed ? stateColour : kindColour;

                const dim = hasFocus && !litIds.has(n.id);
                const isFocused = focusId === n.id;
                const isCore = n.kind === 'core';
                const inCluster = !!p.cluster;

                // Inner structural nodes get plain horizontal labels; the outer
                // perimeter gets rotated chips. Mixing the two is what keeps a
                // dense radial diagram readable.
                const chipKind = n.kind === 'surface' || n.kind === 'external' || n.kind === 'store';
                const plainLabel = isCore || n.kind === 'stage' || n.kind === 'worker';
                const showChip = chipKind && (!hasFocus || litIds.has(n.id));
                const showPlain = plainLabel || isFocused || (hasFocus && litIds.has(n.id) && !chipKind);

                const anchor = labelAnchor(p.angle);
                const lx = p.x + (anchor === 'start' ? p.r + 9 : anchor === 'end' ? -(p.r + 9) : 0);
                const ly = p.y + (anchor === 'middle' ? (p.angle < 90 || p.angle > 270 ? -(p.r + 10) : p.r + 16) : 4);

                // Chips sit just outside the node, pushed along its own radius.
                const chipDist = p.dist + p.r + 30;
                const chipRad = ((p.angle - 90) * Math.PI) / 180;
                const cxp = SCENE.cx + Math.cos(chipRad) * chipDist;
                const cyp = SCENE.cy + Math.sin(chipRad) * chipDist;

                return (
                    <g
                        key={n.id}
                        className={`j-node ${dim ? 'j-node--dimmed' : ''} ${isFocused ? 'j-node--focused' : ''}`}
                        role="button"
                        tabIndex={dim ? -1 : 0}
                        aria-label={`${n.label} — ${n.kind}, status ${state}`}
                        onClick={() => onFocus(n.id)}
                        onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onFocus(n.id); }
                        }}
                    >
                        {/* Generous invisible hit target — the dots are far too
                            small to tap reliably on a phone. */}
                        <circle className="j-node__hit" cx={p.x} cy={p.y} r={Math.max(p.r + 14, 20)} />

                        {/* Two halos at different periods. A single one reads as
                            a mechanical throb; two drifting against each other
                            never quite repeat, which is what makes it feel like
                            breathing. CSS-animated, so they run on the
                            compositor rather than through the frame loop. */}
                        {!inCluster && (
                            <>
                                <circle
                                    className={`j-halo ${state === 'crit' ? 'j-halo--crit' : ''}`}
                                    cx={p.x} cy={p.y} r={p.r * (isCore ? 1.5 : 2.4)}
                                    fill={stateColour}
                                    opacity={STATE_HALO_OPACITY[state]}
                                    style={{
                                        ['--j-breathe-dur' as string]: `${4.2 + (i % 7) * 0.45}s`,
                                        ['--j-breathe-delay' as string]: `${(i % 11) * 0.29}s`,
                                    }}
                                />
                                <circle
                                    className="j-halo"
                                    cx={p.x} cy={p.y} r={p.r * (isCore ? 1.2 : 1.55)}
                                    fill={stateColour}
                                    opacity={STATE_HALO_OPACITY[state] * 0.55}
                                    style={{
                                        ['--j-breathe-dur' as string]: `${6.6 + (i % 5) * 0.7}s`,
                                        ['--j-breathe-delay' as string]: `${(i % 7) * 0.41}s`,
                                    }}
                                />
                            </>
                        )}

                        {/* Radar ping: this node's worker actually ran in the
                            last few minutes. Data-driven, not decoration. */}
                        {pingIds.has(n.id) && (
                            <circle className="j-ping" cx={p.x} cy={p.y} r={p.r + 4}
                                fill="none" stroke={colour} strokeWidth={1.6} />
                        )}

                        {agentNodeIds.has(n.id) && (
                            <g className="j-agent">
                                <circle cx={p.x} cy={p.y - (p.r + 14)} r={3.4} fill="var(--j-agent-c)" />
                            </g>
                        )}

                        {isCore ? (
                            <g className="j-node__scale">
                                <circle cx={p.x} cy={p.y} r={p.r * 2.6} fill="url(#j-core)" pointerEvents="none" />
                                <circle className="j-orbit j-orbit--slow" cx={p.x} cy={p.y} r={p.r + 14}
                                    fill="none" stroke="var(--j-core-c)" strokeWidth={1}
                                    opacity={0.45} strokeDasharray="1 9" />
                                <circle className="j-node__body" cx={p.x} cy={p.y} r={p.r} fill={colour} />
                                <circle cx={p.x} cy={p.y} r={p.r - 13} fill="none"
                                    stroke="var(--j-core-ink)" strokeWidth={1} opacity={0.32} />
                            </g>
                        ) : (
                            <g className="j-node__scale">
                                {/* An arc of the node's own colour, offset from
                                    the body — the reference's signature accent.
                                    Reads as motion frozen mid-orbit. */}
                                {(n.kind === 'stage' || n.kind === 'surface' || n.kind === 'store') && (
                                    <path
                                        d={arcPath(p.x, p.y, p.r + 5, -120, 40)}
                                        fill="none" stroke={colour} strokeWidth={2.4}
                                        strokeLinecap="round" opacity={0.55}
                                    />
                                )}

                                {/* Workers carry a slowly rotating dashed orbit,
                                    because they are the things that fire on a
                                    schedule and should look like it. */}
                                {n.kind === 'worker' && (
                                    <circle className="j-orbit" cx={p.x} cy={p.y} r={p.r + 7}
                                        fill="none" stroke={colour} strokeWidth={1.1}
                                        opacity={0.4} strokeDasharray="2 7"
                                        style={{ ['--j-orbit-dur' as string]: `${16 + (i % 6) * 4}s` }} />
                                )}

                                {/* Flat, unshaded. Depth comes from overlap and
                                    scale, not from a fake light source. */}
                                <circle className="j-node__body" cx={p.x} cy={p.y} r={p.r} fill={colour} />
                            </g>
                        )}

                        {showChip && (
                            <Chip
                                x={cxp} y={cyp}
                                angle={radialAngle(p.angle)}
                                text={n.label}
                                tone={CHIP_TONE[n.kind] ?? 'external'}
                            />
                        )}

                        {showPlain && (
                            <text
                                className="j-node__label"
                                x={isCore ? p.x : lx}
                                y={isCore ? p.y + p.r + 26 : ly}
                                textAnchor={isCore ? 'middle' : anchor}
                                style={isCore
                                    ? { fontSize: 16, fill: 'var(--j-core-label)', letterSpacing: '0.08em' }
                                    : undefined}
                            >
                                {n.label}
                            </text>
                        )}
                    </g>
                );
            })}
        </g>
    );
});

/** An open arc, for the accent strokes that sit outside a node. */
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
    const a0 = ((fromDeg - 90) * Math.PI) / 180;
    const a1 = ((toDeg - 90) * Math.PI) / 180;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
