'use client';

import { memo } from 'react';
import type { BlueprintNode } from '@/lib/engine/blueprint';
import type { Placed } from './layout';
import type { EdgeGeom } from './geometry';
import { pointAt } from './geometry';

/**
 * Canvas layers.
 *
 * Split into memoized layers on purpose. The animation loop re-renders roughly
 * 30 times a second, and only the light layer depends on the frame clock. Nodes
 * and edges re-render only when the DATA changes, which is what keeps a
 * permanently-animating scene affordable.
 */

export type NodeState = 'idle' | 'good' | 'warn' | 'crit' | 'stalled' | 'unknown';

// ── Scene furniture ─────────────────────────────────────────────

/**
 * Glow. Without it the nodes are flat discs on a dark field and the whole thing
 * reads as a scatter plot; with it they read as lights. One shared filter for
 * the scene rather than per-node, which keeps it cheap.
 */
export function Defs() {
    return (
        <defs>
            <filter id="j-glow" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
            <radialGradient id="j-core" cx="50%" cy="50%">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.9" />
                <stop offset="70%" stopColor="var(--gold)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </radialGradient>
        </defs>
    );
}

/**
 * Faint guide circles and sector captions.
 *
 * These carry no data — they exist so the radial arrangement reads as
 * deliberate structure rather than a cloud of dots. Without them a viewer has
 * no way to tell that distance from the centre means anything.
 */
export const RingGuides = memo(function RingGuides({
    radii, cx, cy, dim,
}: { radii: number[]; cx: number; cy: number; dim: boolean }) {
    return (
        <g aria-hidden="true" opacity={dim ? 0.25 : 1}>
            {radii.map((r) => (
                <circle
                    key={r}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="rgba(111,178,255,0.10)"
                    strokeWidth={1}
                    strokeDasharray="2 9"
                />
            ))}
            {/* Sector captions run vertically along the outer edges. The corners
                belong to the HUD chips, and the vertical margin outside the
                last ring is only ~70px, so upright text there would either
                collide with a node or with the chrome. */}
            <text
                x={cx - radii[3] - 24} y={cy} textAnchor="middle"
                transform={`rotate(-90 ${cx - radii[3] - 24} ${cy})`}
                style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', fill: 'rgba(126,166,216,0.72)' }}
            >
                SOURCES
            </text>
            <text
                x={cx + radii[3] + 24} y={cy} textAnchor="middle"
                transform={`rotate(90 ${cx + radii[3] + 24} ${cy})`}
                style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.3em', fill: 'rgba(255,217,160,0.74)' }}
            >
                DESTINATIONS
            </text>
            <text x={cx} y={cy - radii[3] - 30} textAnchor="middle"
                style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.26em', fill: 'rgba(168,151,232,0.6)' }}>
                SERVICES &amp; APIS
            </text>
        </g>
    );
});

/**
 * Two colour channels, deliberately separated.
 *
 * KIND says what a thing IS and never changes. STATE says how it is DOING and
 * lives in the halo.
 *
 * The first version used state for the node fill, and with no telemetry yet
 * every node rendered the same idle grey — a live system that looked dead, and
 * a picture that told you nothing until the first cron fired. Identity is
 * always knowable, so identity gets the fill.
 */
const KIND_COLOR: Record<string, string> = {
    core: 'var(--gold)',
    stage: '#7fc2ff',      // pipeline: sea blue, the spine of the system
    worker: 'var(--gold)', // the things that fire on a schedule
    surface: '#ffd9a0',    // where posts land
    source: '#7ea6d8',     // inbound, quieter than the machinery but still legible
    external: '#a897e8',   // not ours
    store: '#4fc9a8',      // state at rest
};

const STATE_COLOR: Record<NodeState, string> = {
    idle: 'var(--j-idle)',
    good: 'var(--j-good)',
    warn: 'var(--j-warn)',
    crit: 'var(--j-crit)',
    stalled: 'var(--j-warn)',
    unknown: 'var(--j-idle)',
};

/** How loudly the halo argues. Unknown must not look like confident health. */
const STATE_HALO_OPACITY: Record<NodeState, number> = {
    idle: 0.10,
    unknown: 0.08,
    good: 0.20,
    warn: 0.34,
    crit: 0.46,
    stalled: 0.34,
};

// ── Edges ───────────────────────────────────────────────────────

export const EdgeLayer = memo(function EdgeLayer({
    edges, litIds, hasFocus,
}: { edges: EdgeGeom[]; litIds: Set<string>; hasFocus: boolean }) {
    return (
        <g aria-hidden="true">
            {edges.map((e) => {
                const lit = !hasFocus || (litIds.has(e.from) && litIds.has(e.to));
                return (
                    <path
                        key={e.key}
                        d={e.d}
                        className={`j-edge ${hasFocus && lit ? 'j-edge--active' : ''} ${hasFocus && !lit ? 'j-edge--dimmed' : ''}`}
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
 * Position is a pure function of (time, edge index), so there is no per-particle
 * state to store or update — the whole layer is recomputed from the clock each
 * frame. Particle count scales with edge count and is capped, so a big graph on
 * a small phone doesn't melt.
 */
export const ParticleLayer = memo(function ParticleLayer({
    edges, t, dense,
}: { edges: EdgeGeom[]; t: number; dense: boolean }) {
    const per = dense ? 2 : 1;
    const dots: React.ReactElement[] = [];

    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        for (let k = 0; k < per; k++) {
            // Stagger by index so they never march in lockstep.
            const phase = ((t / (7000 + (i % 5) * 900)) + (i * 0.137 + k * 0.5)) % 1;
            const p = pointAt(e, phase);
            dots.push(
                <circle
                    key={`${e.key}-${k}`}
                    cx={p.x}
                    cy={p.y}
                    r={1.5}
                    fill="var(--blue)"
                    opacity={0.28 * Math.sin(Math.PI * phase)}
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
                const colour = p.ok ? 'var(--gold)' : 'var(--sun)';
                // Fade in and out so packets don't pop into existence at a node.
                const fade = Math.sin(Math.PI * prog);
                return (
                    <g key={p.id} opacity={fade}>
                        <circle cx={pt.x} cy={pt.y} r={9} fill={colour} opacity={0.16} />
                        <circle cx={pt.x} cy={pt.y} r={3.2} fill={colour} />
                    </g>
                );
            })}
        </g>
    );
});

// ── Nodes ───────────────────────────────────────────────────────

function labelAnchor(angle: number): 'start' | 'middle' | 'end' {
    if (angle > 15 && angle < 165) return 'start';
    if (angle > 195 && angle < 345) return 'end';
    return 'middle';
}

export const NodeLayer = memo(function NodeLayer({
    placed, states, litIds, hasFocus, focusId, onFocus, agentNodeIds,
}: {
    placed: Placed[];
    states: Map<string, NodeState>;
    litIds: Set<string>;
    hasFocus: boolean;
    focusId: string | null;
    onFocus: (id: string) => void;
    agentNodeIds: Set<string>;
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
                const hollow = n.kind === 'source' || n.kind === 'external';
                // Only the load-bearing nodes get the glow filter. Applying it
                // to all 55 would both cost more and flatten the hierarchy it
                // is there to create.
                const structural = n.kind === 'stage' || n.kind === 'worker' || n.kind === 'surface';

                // Labels are always on for the big structural nodes; source and
                // external labels would collide at overview scale, so they
                // appear when the ring is focused or the node is hovered.
                const alwaysLabel = isCore || n.kind === 'stage' || n.kind === 'surface' || n.kind === 'worker';
                const showLabel = alwaysLabel || isFocused || (hasFocus && litIds.has(n.id));

                const anchor = labelAnchor(p.angle);
                const lx = p.x + (anchor === 'start' ? p.r + 8 : anchor === 'end' ? -(p.r + 8) : 0);
                const ly = p.y + (anchor === 'middle' ? (p.angle < 90 || p.angle > 270 ? -(p.r + 9) : p.r + 15) : 4);

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
                        <circle className="j-node__hit" cx={p.x} cy={p.y} r={Math.max(p.r + 14, 22)} />

                        {/* Breathing halo. CSS-animated so it runs on the
                            compositor rather than through the frame loop. */}
                        <circle
                            className={`j-halo ${state === 'crit' ? 'j-halo--crit' : ''}`}
                            cx={p.x}
                            cy={p.y}
                            r={p.r * (isCore ? 1.5 : 2.1)}
                            fill={stateColour}
                            opacity={STATE_HALO_OPACITY[state]}
                            style={{
                                ['--j-breathe-dur' as string]: `${4.2 + (i % 7) * 0.45}s`,
                                ['--j-breathe-delay' as string]: `${(i % 11) * 0.29}s`,
                            }}
                        />

                        {state === 'stalled' && (
                            <circle
                                className="j-stalled"
                                cx={p.x}
                                cy={p.y}
                                r={p.r + 7}
                                stroke="var(--j-warn)"
                                strokeWidth={1.4}
                            />
                        )}

                        {agentNodeIds.has(n.id) && (
                            <g className="j-agent">
                                <circle cx={p.x} cy={p.y - (p.r + 13)} r={3} fill="var(--blue)" />
                            </g>
                        )}

                        {isCore ? (
                            <>
                                <circle cx={p.x} cy={p.y} r={p.r * 2.4} fill="url(#j-core)" pointerEvents="none" />
                                <circle cx={p.x} cy={p.y} r={p.r} fill="none" stroke="var(--gold)" strokeWidth={1.2} opacity={0.7} />
                                <circle cx={p.x} cy={p.y} r={p.r - 11} fill="none" stroke="var(--blue)" strokeWidth={0.8} opacity={0.45} />
                                <circle
                                    className="j-node__body"
                                    cx={p.x} cy={p.y} r={p.r - 24}
                                    fill={colour}
                                    opacity={0.95}
                                    filter="url(#j-glow)"
                                />
                            </>
                        ) : (
                            // Hollow for the things KumoLab does not own (sources,
                            // third parties); solid for the machinery it does. The
                            // distinction should be legible before any label is.
                            <circle
                                className="j-node__body"
                                cx={p.x}
                                cy={p.y}
                                r={p.r}
                                fill={hollow ? 'rgba(10,16,34,0.9)' : colour}
                                stroke={colour}
                                strokeWidth={hollow ? 2.2 : 0}
                                opacity={hollow ? 1 : 0.92}
                                filter={structural ? 'url(#j-glow)' : undefined}
                            />
                        )}

                        {showLabel && (
                            <text
                                className="j-node__label"
                                x={isCore ? p.x : lx}
                                y={isCore ? p.y + p.r + 22 : ly}
                                textAnchor={isCore ? 'middle' : anchor}
                                style={isCore ? { fontSize: 15, fill: 'var(--gold)', letterSpacing: '0.08em' } : undefined}
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
