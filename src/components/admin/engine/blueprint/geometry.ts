/**
 * geometry.ts — edge curves, solved analytically.
 *
 * Every travelling light on the canvas needs a position along its edge, every
 * frame. The obvious way is SVG's getPointAtLength(), but that forces layout,
 * touches the DOM once per particle per frame, and would make "always alive"
 * genuinely expensive on a phone.
 *
 * Because we author the curves ourselves as quadratic Béziers, the point at t
 * is just arithmetic. No DOM, no refs, no layout — which is what makes ambient
 * motion affordable.
 */

import { SCENE } from './layout';

export interface EdgeGeom {
    key: string;
    from: string;
    to: string;
    ax: number; ay: number;   // start
    qx: number; qy: number;   // control
    bx: number; by: number;   // end
    d: string;                // the SVG path
    len: number;              // approximate arc length, for pacing
}

export function buildEdgeGeom(
    key: string,
    from: string,
    to: string,
    ax: number, ay: number,
    bx: number, by: number,
): EdgeGeom {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(len * 0.16, 54);
    const nx = -dy / len;
    const ny = dx / len;
    const toCentre = (mx - SCENE.cx) * nx + (my - SCENE.cy) * ny;
    const sign = toCentre >= 0 ? 1 : -1;
    const qx = mx + nx * bow * sign;
    const qy = my + ny * bow * sign;

    return {
        key, from, to, ax, ay, qx, qy, bx, by,
        d: `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`,
        // Chord + control-polygon average: close enough for pacing, and far
        // cheaper than integrating the curve.
        len: (len + Math.hypot(qx - ax, qy - ay) + Math.hypot(bx - qx, by - qy)) / 2,
    };
}

/** Point at t ∈ [0,1] along the quadratic Bézier. */
export function pointAt(e: EdgeGeom, t: number): { x: number; y: number } {
    const u = 1 - t;
    const a = u * u;
    const b = 2 * u * t;
    const c = t * t;
    return {
        x: a * e.ax + b * e.qx + c * e.bx,
        y: a * e.ay + b * e.qy + c * e.by,
    };
}
