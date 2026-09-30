'use client';

import type { TextStyle } from './types';

/**
 * Brand fonts for Studio text clips.
 *
 * Self-hosted from /public/fonts/studio (variable woff2) and registered with
 * the FontFace API under their REAL family names, so the `fontFamily` string
 * stored on a clip is portable (not a next/font hashed name) and works under
 * the editor route's COEP (same-origin, no CORS dance).
 *
 * Canvas text does not wait for web fonts: painting before a face is loaded
 * silently uses the fallback. The live preview repaints every frame so it
 * self-corrects, but the exporter paints each text PNG ONCE, so it must await
 * `ensureTextFonts` first.
 */

export interface StudioFont {
    label: string;
    /** CSS font-family list stored on TextStyle.fontFamily. */
    value: string;
    weights: number[];
}

export const STUDIO_FONTS: StudioFont[] = [
    { label: 'Inter', value: 'Inter, system-ui, sans-serif', weights: [400, 600, 700, 800, 900] },
    { label: 'Cormorant', value: "'Cormorant Garamond', Georgia, serif", weights: [400, 500, 600, 700] },
    { label: 'Manrope', value: 'Manrope, Inter, sans-serif', weights: [400, 600, 700, 800] },
];

export const DEFAULT_FONT_FAMILY = STUDIO_FONTS[0].value;

const FACES: { family: string; url: string; weight: string }[] = [
    { family: 'Inter', url: '/fonts/studio/Inter.woff2', weight: '100 900' },
    { family: 'Cormorant Garamond', url: '/fonts/studio/CormorantGaramond.woff2', weight: '300 700' },
    { family: 'Manrope', url: '/fonts/studio/Manrope.woff2', weight: '200 800' },
];

let loading: Promise<void> | null = null;

/** Register + load every Studio face once per page. Never throws. */
export function loadStudioFonts(): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
        await Promise.all(FACES.map(async (f) => {
            try {
                const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, { weight: f.weight, style: 'normal' });
                await face.load();
                document.fonts.add(face);
            } catch (e) {
                console.warn('[studio] font load failed', f.family, e);
            }
        }));
    })();
    return loading;
}

/** Match a stored family list back to its picker entry (Inter when unknown). */
export function fontFor(family: string | undefined): StudioFont {
    if (!family) return STUDIO_FONTS[0];
    return STUDIO_FONTS.find((f) => f.value === family)
        || STUDIO_FONTS.find((f) => family.toLowerCase().includes(f.label.toLowerCase()))
        || STUDIO_FONTS[0];
}

/** Resolve once every font the given text styles use is ready to paint. */
export async function ensureTextFonts(styles: (TextStyle | undefined)[]): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    await loadStudioFonts();
    const specs = new Set<string>();
    for (const ts of styles) {
        if (!ts) continue;
        specs.add(`${ts.weight ?? 800} 40px ${ts.fontFamily || DEFAULT_FONT_FAMILY}`);
    }
    await Promise.all([...specs].map((s) => document.fonts.load(s).catch(() => [])));
    await document.fonts.ready;
}
