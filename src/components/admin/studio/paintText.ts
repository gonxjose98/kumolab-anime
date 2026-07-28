import type { TextStyle } from './types';
import { activeWordIndex } from '@/lib/studio/captionLines';

/**
 * Single source of truth for drawing a text overlay onto a 2D canvas, used by
 * BOTH the live preview (PreviewCanvas) and the exporter (renderProject) so
 * they always agree.
 *
 * Three layers of colour, in increasing priority:
 *   1. ts.color            — the line
 *   2. ts.wordColors[i]    — manual per-word overrides (tap-a-word in Inspector)
 *   3. the ACTIVE word     — karaoke highlight, when ts.words carries timings
 *                            and `opts.localT` says where we are in the clip
 *
 * `x`/`y` are absolute canvas pixels (the clip's centre position). Pass
 * `opts.maxWidth` to wrap; without it the text stays on one line, which is the
 * historical behaviour every existing text clip relies on.
 */

export interface PaintTextOptions {
    /** Seconds since the clip started. Drives the karaoke highlight. */
    localT?: number;
    /** Wrap to this pixel width. Omit for single-line (legacy) behaviour. */
    maxWidth?: number;
}

/** Index of the word active at `localT`, or -1. Shares the tested helper so
 *  preview, export and the caption editor can never disagree on timing. */
function activeIndex(ts: TextStyle, localT: number | undefined): number {
    if (localT == null || !ts.words?.length) return -1;
    return activeWordIndex(ts.words, localT);
}

/** Greedy wrap of `words` into lines that each fit `maxWidth`. */
function wrapWords(ctx: CanvasRenderingContext2D, words: string[], maxWidth: number): string[][] {
    const lines: string[][] = [];
    let line: string[] = [];
    for (const w of words) {
        const candidate = line.length ? [...line, w] : [w];
        if (line.length && ctx.measureText(candidate.join(' ')).width > maxWidth) {
            lines.push(line);
            line = [w];
        } else {
            line = candidate;
        }
    }
    if (line.length) lines.push(line);
    return lines.length ? lines : [[]];
}

export function paintText(
    ctx: CanvasRenderingContext2D,
    ts: TextStyle,
    x: number,
    y: number,
    canvasH: number,
    opts: PaintTextOptions = {},
): void {
    const text = ts.text ?? '';
    if (!text) return;
    const fontPx = ts.sizePct * canvasH;
    const align = (ts.align ?? 'center') as CanvasTextAlign;

    ctx.save();
    ctx.font = `${ts.weight ?? 800} ${fontPx}px ${ts.fontFamily || 'Inter, system-ui, sans-serif'}`;
    ctx.textBaseline = 'middle';

    const allWords = text.split(' ').filter((w) => w.length > 0);
    const active = activeIndex(ts, opts.localT);
    const hasWordColors = !!ts.wordColors && ts.wordColors.some((c) => !!c);
    // Per-word layout is only needed when some word differs from the line.
    const perWord = hasWordColors || active >= 0;

    const lines = opts.maxWidth ? wrapWords(ctx, allWords, opts.maxWidth) : [allWords];
    const lineH = fontPx * 1.18;
    // Centre the block vertically on `y` so wrapping grows both ways rather
    // than pushing the caption off the bottom of the frame.
    const firstY = y - ((lines.length - 1) * lineH) / 2;

    const spaceW = ctx.measureText(' ').width;
    const stroke = (s: string, sx: number, sy: number) => {
        if (!ts.strokePx) return;
        ctx.lineWidth = ts.strokePx * (fontPx / 40);
        ctx.strokeStyle = ts.strokeColor || 'rgba(0,0,0,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(s, sx, sy);
    };

    let wordCursor = 0;
    for (let li = 0; li < lines.length; li++) {
        const words = lines[li];
        const lineText = words.join(' ');
        const lineY = firstY + li * lineH;
        const lineW = ctx.measureText(lineText).width;
        const left = align === 'left' ? x : align === 'right' ? x - lineW : x - lineW / 2;

        // Optional caption background box, sized per line.
        if (ts.bg) {
            const pad = fontPx * 0.25;
            ctx.fillStyle = ts.bg;
            ctx.fillRect(left - pad, lineY - fontPx / 2 - pad, lineW + pad * 2, fontPx + pad * 2);
        }

        if (!perWord) {
            ctx.textAlign = align;
            stroke(lineText, x, lineY);
            ctx.fillStyle = ts.color;
            ctx.fillText(lineText, x, lineY);
            wordCursor += words.length;
            continue;
        }

        // Lay words out left-to-right so each can carry its own colour.
        ctx.textAlign = 'left';
        let cursor = left;
        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const gi = wordCursor + i;
            const wWidth = ctx.measureText(w).width;
            const isActive = gi === active;

            // Karaoke pop: an optional filled pill behind the spoken word.
            if (isActive && ts.highlightBg) {
                const pad = fontPx * 0.18;
                ctx.fillStyle = ts.highlightBg;
                const r = Math.min(fontPx * 0.22, 24);
                const bx = cursor - pad;
                const by = lineY - fontPx / 2 - pad * 0.7;
                const bw = wWidth + pad * 2;
                const bh = fontPx + pad * 1.4;
                ctx.beginPath();
                // roundRect is widely supported; fall back to a plain rect.
                if (typeof (ctx as any).roundRect === 'function') {
                    (ctx as any).roundRect(bx, by, bw, bh, r);
                } else {
                    ctx.rect(bx, by, bw, bh);
                }
                ctx.fill();
            }

            stroke(w, cursor, lineY);
            ctx.fillStyle = isActive
                ? (ts.highlightColor || '#ffd76e')
                : (ts.wordColors?.[gi] || ts.color);
            ctx.fillText(w, cursor, lineY);
            cursor += wWidth + spaceW;
        }
        wordCursor += words.length;
    }

    ctx.restore();
}
