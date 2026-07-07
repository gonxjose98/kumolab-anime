'use client';

import { useEffect } from 'react';

/**
 * Route-scoped scroll unlock for content-sky pages.
 *
 * globals.css declares `html, body { height: 100%; overflow-x: hidden }`,
 * which collapses the document scroller: <html> is pinned to one viewport
 * and the real overflow gets trapped inside <body>, which becomes its own
 * scroll container. window.scrollY then sticks at 0, so the global nav's
 * show-on-scroll chrome (and our data-sky-scrolled mirror) never fire,
 * and position:sticky binds to the wrong scrollport.
 *
 * Content pages must scroll like normal documents, so we restore normal
 * viewport scrolling here — inline styles on mount, fully reverted on
 * unmount — without touching any shared component or global stylesheet.
 */
export default function ScrollUnlock() {
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;

        const prev = {
            htmlHeight: html.style.height,
            bodyHeight: body.style.height,
            bodyOverflow: body.style.overflow,
        };

        html.style.height = 'auto';
        body.style.height = 'auto';
        // `overflow-x: hidden` also turns <body> into a scroll container.
        // Make body fully visible; horizontal clipping is still enforced
        // by <html>'s overflow-x and the page's own `overflow-x: clip`.
        body.style.overflow = 'visible';

        return () => {
            html.style.height = prev.htmlHeight;
            body.style.height = prev.bodyHeight;
            body.style.overflow = prev.bodyOverflow;
        };
    }, []);

    return null;
}
