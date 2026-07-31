'use client';

/**
 * useSlotDrag — one pointer path for mouse and touch.
 *
 * Pointer Events only: a mouse drag and a finger drag run the same code, so
 * the dial behaves identically on Jose's phone and on the desktop. The drop
 * target is resolved with elementsFromPoint against the invisible hit circles
 * the dial paints over each peak slot (`data-slot-iso`), which keeps the
 * geometry in the SVG where it belongs instead of duplicating trigonometry
 * here.
 *
 * A press that never travels past TAP_SLOP is reported as a tap, so the same
 * handler opens a bead's score breakdown.
 */

import { useCallback, useRef, useState } from 'react';

const TAP_SLOP = 6; // px

export interface SlotDragState {
    postId: string;
    x: number;
    y: number;
    overSlot: string | null;   // ISO of the peak slot under the pointer
    moved: boolean;
}

export function useSlotDrag(opts: {
    onDrop: (postId: string, slotIso: string) => void;
    onTap: (postId: string) => void;
    disabled?: boolean;
}) {
    const { onDrop, onTap, disabled } = opts;
    const [drag, setDrag] = useState<SlotDragState | null>(null);
    const live = useRef<(SlotDragState & { x0: number; y0: number }) | null>(null);

    const slotUnder = (x: number, y: number): string | null => {
        if (typeof document === 'undefined' || !document.elementsFromPoint) return null;
        for (const el of document.elementsFromPoint(x, y)) {
            const iso = (el as HTMLElement).getAttribute?.('data-slot-iso');
            if (iso) return iso;
        }
        return null;
    };

    const onPointerDown = useCallback((postId: string) => (e: React.PointerEvent) => {
        if (disabled || e.button > 0) return;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        const st = { postId, x: e.clientX, y: e.clientY, overSlot: null, moved: false, x0: e.clientX, y0: e.clientY };
        live.current = st;
        setDrag({ postId, x: st.x, y: st.y, overSlot: null, moved: false });
    }, [disabled]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const st = live.current;
        if (!st) return;
        e.preventDefault();
        const moved = st.moved || Math.abs(e.clientX - st.x0) > TAP_SLOP || Math.abs(e.clientY - st.y0) > TAP_SLOP;
        const overSlot = moved ? slotUnder(e.clientX, e.clientY) : null;
        st.x = e.clientX; st.y = e.clientY; st.moved = moved; st.overSlot = overSlot;
        setDrag({ postId: st.postId, x: st.x, y: st.y, overSlot, moved });
    }, []);

    const end = useCallback((commit: boolean) => (e: React.PointerEvent) => {
        const st = live.current;
        live.current = null;
        setDrag(null);
        if (!st) return;
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        if (!commit) return;
        if (!st.moved) { onTap(st.postId); return; }
        const target = st.overSlot ?? slotUnder(e.clientX, e.clientY);
        // No target = no write. There is deliberately no "drop back to standby"
        // gesture: standby membership is a NULL slot time, and a NULL hands the
        // post to the pruner, which can unapprove it.
        if (target) onDrop(st.postId, target);
    }, [onDrop, onTap]);

    /** Spread onto anything draggable (a rim bead or a standby chip). */
    const bind = useCallback((postId: string) => ({
        onPointerDown: onPointerDown(postId),
        onPointerMove,
        onPointerUp: end(true),
        onPointerCancel: end(false),
        style: { touchAction: 'none' as const, cursor: disabled ? 'pointer' : 'grab' },
    }), [onPointerDown, onPointerMove, end, disabled]);

    return { drag, bind };
}
