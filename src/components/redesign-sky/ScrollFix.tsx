'use client';

import { useEffect } from 'react';

/**
 * Route-scoped scroll unlock for /redesign-sky.
 *
 * globals.css declares `html, body { height: 100%; overflow-x: hidden }`.
 * That combination collapses the document scroller: <html> is pinned to
 * exactly one viewport (scrollHeight == innerHeight, so the page "cannot
 * scroll"), and the real overflow ends up trapped inside <body>, which
 * becomes its own scroll container. Result: window.scrollY is stuck at 0,
 * scroll chaining from fixed elements dies, wheel input lands with heavy
 * latency, and every scroll-position-driven behaviour breaks.
 *
 * This page IS a scroll journey, so we restore normal document scrolling
 * here — inline styles on mount, fully reverted on unmount — without
 * touching any shared component or global stylesheet.
 */
export default function ScrollFix() {
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;

        const prev = {
            htmlHeight: html.style.height,
            bodyHeight: body.style.height,
            bodyOverflow: body.style.overflow,
        };

        // Let the document grow with its content again → the viewport
        // becomes the scroller and window.scrollY works normally.
        html.style.height = 'auto';
        body.style.height = 'auto';
        // `overflow-x: hidden` also turns <body> into a scroll container,
        // which hijacks position:sticky (it binds to body's never-moving
        // scrollport instead of the viewport). Make body fully visible;
        // horizontal clipping is still enforced by <html>'s overflow-x
        // and this page's own `overflow-x: clip` wrapper.
        body.style.overflow = 'visible';

        return () => {
            html.style.height = prev.htmlHeight;
            body.style.height = prev.bodyHeight;
            body.style.overflow = prev.bodyOverflow;
        };
    }, []);

    return null;
}
