import type { TextStyle } from './types';

/**
 * Single source of truth for drawing a text overlay onto a 2D canvas, used by
 * BOTH the live preview (PreviewCanvas) and the exporter (renderProject) so
 * they always agree. Supports an optional caption background, an outline
 * stroke, and per-word colours (ts.wordColors, parallel to the whitespace-split
 * words) so specific words can be highlighted a different colour.
 *
 * `x`/`y` are absolute canvas pixels (the clip's centre position). Single line
 * only, matching the previous behaviour.
 */
export function paintText(
    ctx: CanvasRenderingContext2D,
    ts: TextStyle,
    x: number,
    y: number,
    canvasH: number,
): void {
    const text = ts.text ?? '';
    if (!text) return;
    const fontPx = ts.sizePct * canvasH;
    const align = (ts.align ?? 'center') as CanvasTextAlign;

    ctx.save();
    ctx.font = `${ts.weight ?? 800} ${fontPx}px ${ts.fontFamily || 'Inter, system-ui, sans-serif'}`;
    ctx.textBaseline = 'middle';

    // Optional caption background box, sized to the whole line.
    if (ts.bg) {
        ctx.textAlign = align;
        const w = ctx.measureText(text).width;
        const pad = fontPx * 0.25;
        const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        ctx.fillStyle = ts.bg;
        ctx.fillRect(left - pad, y - fontPx / 2 - pad, w + pad * 2, fontPx + pad * 2);
    }

    const words = text.split(' ');
    const hasWordColors = !!ts.wordColors && ts.wordColors.some((c) => !!c);

    // Fast path: one colour for the whole line.
    if (!hasWordColors) {
        ctx.textAlign = align;
        if (ts.strokePx) {
            ctx.lineWidth = ts.strokePx * (fontPx / 40);
            ctx.strokeStyle = ts.strokeColor || 'rgba(0,0,0,0.85)';
            ctx.lineJoin = 'round';
            ctx.strokeText(text, x, y);
        }
        ctx.fillStyle = ts.color;
        ctx.fillText(text, x, y);
        ctx.restore();
        return;
    }

    // Per-word path: lay words out left-to-right ourselves so each can carry
    // its own colour, then offset the run to honour the alignment.
    ctx.textAlign = 'left';
    const spaceW = ctx.measureText(' ').width;
    const widths = words.map((w) => ctx.measureText(w).width);
    const total = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);
    let cursor = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (ts.strokePx) {
            ctx.lineWidth = ts.strokePx * (fontPx / 40);
            ctx.strokeStyle = ts.strokeColor || 'rgba(0,0,0,0.85)';
            ctx.lineJoin = 'round';
            ctx.strokeText(w, cursor, y);
        }
        ctx.fillStyle = ts.wordColors?.[i] || ts.color;
        ctx.fillText(w, cursor, y);
        cursor += widths[i] + spaceW;
    }
    ctx.restore();
}
