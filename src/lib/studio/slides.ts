/**
 * Carousel slide persistence helpers.
 *
 * A post's image_settings may carry an optional `slides` array:
 *   image_settings.slides?: Array<{
 *       sourceUrl: string;      // the slide's background image
 *       title: string;          // per-slide overlay title (slide 1 mirrors posts.title)
 *       excerpt: string;        // per-slide overlay sub-caption
 *       settings: Settings;     // the same overlay Settings a single image has
 *   }>
 *
 * Only 2+ entries mean "carousel". 0-1 entries collapse to the legacy
 * single-image shape (no slides key at all), so every auto-pipeline post and
 * pre-carousel draft keeps its exact historical behavior. The legacy
 * top-level keys (sourceUrl, applyText, …) always mirror slide 1 — the cover
 * — so old consumers (cron rebake, emergency re-render, publisher) read a
 * valid snapshot without knowing carousels exist.
 */

// The overlay-setting keys the editor hydrates from image_settings on load.
export const SETTING_KEYS = [
    'applyText', 'applyGradient', 'applyWatermark', 'gradientPosition', 'gradientStrength',
    'titleScale', 'captionScale', 'titleOffset', 'captionOffset', 'watermarkPosition',
    'purpleWordIndices', 'convertToReel', 'imageScale', 'imagePosition',
] as const;

// Sanitize a client-supplied slides payload down to the persisted shape:
// { sourceUrl, title, excerpt, settings (SETTING_KEYS only) } per slide.
export function sanitizeSlides(raw: unknown): Array<Record<string, any>> {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((sl: any) => sl && typeof sl === 'object' && typeof sl.sourceUrl === 'string')
        .map((sl: any) => {
            const settings: Record<string, any> = {};
            const src = sl.settings && typeof sl.settings === 'object' ? sl.settings : {};
            for (const k of SETTING_KEYS) if (k in src) settings[k] = src[k];
            return {
                sourceUrl: sl.sourceUrl,
                title: typeof sl.title === 'string' ? sl.title : '',
                excerpt: typeof sl.excerpt === 'string' ? sl.excerpt : '',
                settings,
            };
        });
}

/**
 * Apply a slides payload onto a working image_settings object IN PLACE:
 * 2+ sanitized slides are written to image_settings.slides; 0-1 collapse to
 * the legacy shape by REMOVING the key (so deleting a carousel down to one
 * slide round-trips back to a plain single-image post). When the caller sent
 * no slides field at all (undefined), the existing value is left untouched —
 * only an explicit array is authoritative.
 */
export function applySlides(imageSettings: Record<string, any>, rawSlides: unknown): void {
    if (rawSlides === undefined) return;
    const slides = sanitizeSlides(rawSlides);
    if (slides.length >= 2) imageSettings.slides = slides;
    else delete imageSettings.slides;
}
