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
 */

import type { BlueprintNode } from '@/lib/engine/blueprint';

export const SCENE = { w: 1000, h: 1000, cx: 500, cy: 500 };

/** Ring radii by role. Exported so the canvas can draw the guide circles. */
export const R = {
    stage: 128,
    worker: 232,
    edge: 336,     // sources + destinations
    outer: 428,    // externals + stores
} as const;

export interface Placed {
    node: BlueprintNode;
    x: number;
    y: number;
    /** Base radius of the node's dot. */
    r: number;
    /** Degrees from 12 o'clock, clockwise. Used to place labels outward. */
    angle: number;
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
    core: 46,
    stage: 15,
    worker: 13,
    source: 7,
    surface: 13,
    external: 9,
    store: 11,
};

/**
 * Place every node.
 *
 * Sources take the left arc and destinations the right, so the picture reads
 * left-to-right as content flowing in and posts flowing out — the same
 * direction the pipeline is described in everywhere else.
 */
export function layoutNodes(nodes: BlueprintNode[]): Placed[] {
    const by = (k: BlueprintNode['kind']) => nodes.filter((n) => n.kind === k);

    const core = by('core');
    const stages = by('stage');
    const workers = by('worker');
    const sources = by('source');
    const surfaces = by('surface');
    const outer = [...by('external'), ...by('store')];

    const out: Placed[] = [];

    for (const n of core) {
        out.push({ node: n, x: SCENE.cx, y: SCENE.cy, r: DOT.core, angle: 0 });
    }

    // Stages: full circle, starting at the top so "Candidates" reads first.
    spread(stages.length, 0, 360, true).forEach((a, i) => {
        const p = polar(a, R.stage);
        out.push({ node: stages[i], x: p.x, y: p.y, r: DOT.stage, angle: a });
    });

    // Workers: full circle, offset half a step so they interleave with the
    // stages rather than hiding directly behind them.
    const wStep = 360 / Math.max(workers.length, 1);
    spread(workers.length, wStep / 2, 360 + wStep / 2, true).forEach((a, i) => {
        const p = polar(a % 360, R.worker);
        out.push({ node: workers[i], x: p.x, y: p.y, r: DOT.worker, angle: a % 360 });
    });

    // Sources: left arc (roughly 8 o'clock round to 4 o'clock).
    spread(sources.length, 200, 340, false).forEach((a, i) => {
        const p = polar(a, R.edge);
        out.push({ node: sources[i], x: p.x, y: p.y, r: DOT.source, angle: a });
    });

    // Destinations: right arc, mirrored.
    spread(surfaces.length, 25, 155, false).forEach((a, i) => {
        const p = polar(a, R.edge);
        out.push({ node: surfaces[i], x: p.x, y: p.y, r: DOT.surface, angle: a });
    });

    // Externals + stores: the outermost shell, full circle.
    spread(outer.length, 12, 372, true).forEach((a, i) => {
        const p = polar(a % 360, R.outer);
        out.push({ node: outer[i], x: p.x, y: p.y, r: DOT[outer[i].kind], angle: a % 360 });
    });

    return out;
}

/**
 * A gently curved path between two points.
 *
 * Straight lines through a radial diagram look like spokes and make the whole
 * thing read as a wheel; a slight arc lets the eye follow one connection
 * through a crowd. The bow is perpendicular to the run and scales with
 * distance, so short hops stay nearly straight.
 */
export function edgePath(ax: number, ay: number, bx: number, by: number): string {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(len * 0.16, 54);
    // Perpendicular, biased so curves bend away from the centre.
    const nx = -dy / len;
    const ny = dx / len;
    const toCentre = (mx - SCENE.cx) * nx + (my - SCENE.cy) * ny;
    const sign = toCentre >= 0 ? 1 : -1;
    return `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${(mx + nx * bow * sign).toFixed(1)} ${(my + ny * bow * sign).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
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
    const pad = 120;
    const minX = Math.min(...pts.map((p) => p.x - p.r)) - pad;
    const maxX = Math.max(...pts.map((p) => p.x + p.r)) + pad;
    const minY = Math.min(...pts.map((p) => p.y - p.r)) - pad;
    const maxY = Math.max(...pts.map((p) => p.y + p.r)) + pad;

    // Keep the scene's aspect ratio, or SVG letterboxes the focus and the
    // camera appears to jump sideways on the way in.
    const w = Math.max(maxX - minX, 260);
    const h = Math.max(maxY - minY, 260);
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
