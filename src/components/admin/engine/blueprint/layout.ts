/**
 * layout.ts — where every node sits on the canvas.
 *
 * Pure geometry, deliberately separate from rendering: the positions are also
 * what the camera animates toward and what hit-testing uses, so they need to be
 * computable without a React tree. No side effects, no DOM.
 *
 * The scene is polar. Distance from the core reads as "how far from the beating
 * heart of the system", and angle groups things by role:
 *
 *        sources ◄──── left arc          right arc ────► destinations
 *                          ( ( ( core ) ) )
 *                    externals + stores on the outside
 *
 * Angles are measured from 12 o'clock, clockwise, in degrees, so reasoning
 * about the picture matches reasoning about a clock face.
 *
 * Sources are CLUSTERED rather than strung along the arc. Seventeen equal dots
 * on a ring read as a list; two labelled constellations read as structure, and
 * their edges bundle naturally into a single flowing ribbon toward detection.
 */

import type { BlueprintNode } from '@/lib/engine/blueprint';

export const SCENE = { w: 1120, h: 1120, cx: 560, cy: 560 };

/** Ring radii by role. Exported so the canvas can draw the guide bands. */
export const R = {
    stage: 152,
    worker: 258,
    edge: 362,     // source clusters + destinations
    outer: 452,    // externals + stores
} as const;

/** Where each source constellation sits, and how wide it spreads. */
const CLUSTERS: Record<string, { angle: number; radius: number; spread: number; label: string }> = {
    youtube: { angle: 246, radius: 352, spread: 74, label: 'YouTube channels' },
    rss: { angle: 310, radius: 340, spread: 44, label: 'RSS feeds' },
};

export interface Placed {
    node: BlueprintNode;
    x: number;
    y: number;
    /** Base radius of the node's dot. */
    r: number;
    /** Degrees from 12 o'clock, clockwise. Used to place labels outward. */
    angle: number;
    /** Distance from the scene centre — chip labels sit just beyond this. */
    dist: number;
    /** Constellation this node belongs to, if any. */
    cluster?: string;
}

export interface ClusterMark {
    key: string;
    label: string;
    x: number;
    y: number;
    r: number;
    angle: number;
    count: number;
}

function polar(angleDeg: number, radius: number): { x: number; y: number } {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: SCENE.cx + Math.cos(rad) * radius, y: SCENE.cy + Math.sin(rad) * radius };
}

/**
 * Spread `n` items across an angular span. `spread` is inclusive of both ends
 * when the span is partial (an arc), and excludes the wrap-around duplicate
 * when it is a full circle.
 */
function spread(n: number, from: number, to: number, full: boolean): number[] {
    if (n <= 0) return [];
    if (n === 1) return [(from + to) / 2];
    const step = full ? (to - from) / n : (to - from) / (n - 1);
    return Array.from({ length: n }, (_, i) => from + i * step);
}

const DOT: Record<BlueprintNode['kind'], number> = {
    core: 48,
    stage: 17,
    worker: 14,
    source: 6.5,
    surface: 15,
    external: 10,
    store: 11.5,
};

/** The golden angle. Phyllotaxis packs a disc evenly without looking gridded. */
const GOLDEN = 137.50776405003785;

export function layoutNodes(nodes: BlueprintNode[]): { placed: Placed[]; clusters: ClusterMark[] } {
    const by = (k: BlueprintNode['kind']) => nodes.filter((n) => n.kind === k);

    const core = by('core');
    const stages = by('stage');
    const workers = by('worker');
    const sources = by('source');
    const surfaces = by('surface');
    const outer = [...by('external'), ...by('store')];

    const out: Placed[] = [];
    const push = (node: BlueprintNode, x: number, y: number, r: number, cluster?: string) => {
        const dx = x - SCENE.cx;
        const dy = y - SCENE.cy;
        out.push({
            node, x, y, r, cluster,
            angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
            dist: Math.hypot(dx, dy),
        });
    };

    for (const n of core) push(n, SCENE.cx, SCENE.cy, DOT.core);

    // Stages: full circle, starting at the top so "Candidates" reads first.
    spread(stages.length, 0, 360, true).forEach((a, i) => {
        const p = polar(a, R.stage);
        push(stages[i], p.x, p.y, DOT.stage);
    });

    // Workers: offset half a step so they interleave with the stages rather
    // than hiding directly behind them.
    const wStep = 360 / Math.max(workers.length, 1);
    spread(workers.length, wStep / 2, 360 + wStep / 2, true).forEach((a, i) => {
        const p = polar(a % 360, R.worker);
        push(workers[i], p.x, p.y, DOT.worker);
    });

    // ── Source constellations ──
    const clusters: ClusterMark[] = [];
    const grouped = new Map<string, BlueprintNode[]>();
    const ungrouped: BlueprintNode[] = [];
    for (const s of sources) {
        if (s.group && CLUSTERS[s.group]) {
            const arr = grouped.get(s.group);
            if (arr) arr.push(s); else grouped.set(s.group, [s]);
        } else {
            ungrouped.push(s);
        }
    }

    for (const [key, members] of grouped) {
        const cfg = CLUSTERS[key];
        const centre = polar(cfg.angle, cfg.radius);
        members.forEach((n, i) => {
            // Phyllotaxis: sqrt keeps the disc evenly dense rather than
            // crowding the middle, and the golden angle stops rings forming.
            const rr = cfg.spread * Math.sqrt((i + 0.5) / members.length);
            const th = ((i * GOLDEN - 90) * Math.PI) / 180;
            push(n, centre.x + Math.cos(th) * rr, centre.y + Math.sin(th) * rr, DOT.source, key);
        });
        clusters.push({
            key,
            label: cfg.label,
            x: centre.x,
            y: centre.y,
            r: cfg.spread,
            angle: cfg.angle,
            count: members.length,
        });
    }

    // Any source without a cluster falls back to the old arc.
    spread(ungrouped.length, 200, 340, false).forEach((a, i) => {
        const p = polar(a, R.edge);
        push(ungrouped[i], p.x, p.y, DOT.source);
    });

    // Destinations: right arc.
    spread(surfaces.length, 28, 152, false).forEach((a, i) => {
        const p = polar(a, R.edge);
        push(surfaces[i], p.x, p.y, DOT.surface);
    });

    // Externals + stores: the outermost shell. Kept off the extreme left so
    // they don't sit on top of the source constellations.
    spread(outer.length, 8, 368, true).forEach((a, i) => {
        const p = polar(a % 360, R.outer);
        push(outer[i], p.x, p.y, DOT[outer[i].kind]);
    });

    return { placed: out, clusters };
}

/**
 * Decorative dot field beyond the outer ring.
 *
 * Deterministic from a fixed seed rather than Math.random(): the dots must land
 * in the same place on the server and on the client, or hydration mismatches.
 */
export function fieldDots(count = 90): { x: number; y: number; r: number; o: number }[] {
    const dots: { x: number; y: number; r: number; o: number }[] = [];
    let seed = 20260731;
    const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
        const a = rnd() * 360;
        const d = R.outer + 34 + rnd() * 118;
        const p = polar(a, d);
        if (p.x < 4 || p.x > SCENE.w - 4 || p.y < 4 || p.y > SCENE.h - 4) continue;
        dots.push({ x: p.x, y: p.y, r: 1.2 + rnd() * 3.4, o: 0.10 + rnd() * 0.3 });
    }
    return dots;
}

/**
 * The viewBox for a focused node: a tight window around it and its neighbours.
 * Returning a plain rect (rather than a transform) means the camera move is a
 * single interpolable value and SVG handles all the scaling for us.
 */
export function focusBox(
    placed: Placed[],
    focusId: string | null,
    /**
     * Fraction of the viewport the inspector covers on the right (0 when it is
     * a bottom sheet). The camera widens to the right by this much so the node
     * you just clicked does not end up underneath the panel describing it.
     */
    rightCover = 0,
): [number, number, number, number] {
    const all: [number, number, number, number] = [0, 0, SCENE.w, SCENE.h];
    if (!focusId) return all;

    const target = placed.find((p) => p.node.id === focusId);
    if (!target) return all;

    const neighbourIds = new Set<string>([focusId, ...target.node.feeds]);
    for (const p of placed) {
        if (p.node.feeds.includes(focusId)) neighbourIds.add(p.node.id);
    }

    const pts = placed.filter((p) => neighbourIds.has(p.node.id));
    const pad = 140;
    const minX = Math.min(...pts.map((p) => p.x - p.r)) - pad;
    const maxX = Math.max(...pts.map((p) => p.x + p.r)) + pad;
    const minY = Math.min(...pts.map((p) => p.y - p.r)) - pad;
    const maxY = Math.max(...pts.map((p) => p.y + p.r)) + pad;

    // Keep the scene's aspect ratio, or SVG letterboxes the focus and the
    // camera appears to jump sideways on the way in.
    const w = Math.max(maxX - minX, 300);
    const h = Math.max(maxY - minY, 300);
    const aspect = SCENE.w / SCENE.h;
    let fw = w;
    let fh = h;
    if (w / h > aspect) fh = w / aspect; else fw = h * aspect;

    const cxBox = minX + w / 2;
    const cyBox = minY + h / 2;

    if (rightCover > 0 && rightCover < 0.9) {
        // Grow the window so the SAME content occupies only the uncovered
        // fraction, then push the origin left so that fraction sits on the
        // visible side.
        const grown = fw / (1 - rightCover);
        const grownH = grown / aspect;
        return [cxBox - grown * (1 - rightCover) / 2, cyBox - grownH / 2, grown, grownH];
    }

    return [cxBox - fw / 2, cyBox - fh / 2, fw, fh];
}

/** Which nodes stay lit when `focusId` is focused. Empty set = everything. */
export function focusSet(placed: Placed[], focusId: string | null): Set<string> {
    if (!focusId) return new Set();
    const keep = new Set<string>([focusId]);
    const target = placed.find((p) => p.node.id === focusId);
    if (target) target.node.feeds.forEach((f) => keep.add(f));
    for (const p of placed) {
        if (p.node.feeds.includes(focusId)) keep.add(p.node.id);
    }
    return keep;
}
