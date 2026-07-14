'use client';

import type { TextStyle } from './types';

/**
 * A saved text "look" the operator can reuse, so styling captions once carries
 * forward to every new text clip. Stored in localStorage (per browser). Only
 * the STYLE + placement are saved, never the words or per-word colours.
 */
const KEY = 'kumolab_text_template_v1';

export interface TextTemplate {
    style: Pick<TextStyle, 'color' | 'sizePct' | 'weight' | 'align' | 'bg' | 'strokePx' | 'strokeColor'>;
    xPct: number;
    yPct: number;
}

export function saveTextTemplate(t: TextTemplate): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(t));
    } catch {
        /* private mode / quota — best effort */
    }
}

export function loadTextTemplate(): TextTemplate | null {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as TextTemplate) : null;
    } catch {
        return null;
    }
}

export function clearTextTemplate(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}
