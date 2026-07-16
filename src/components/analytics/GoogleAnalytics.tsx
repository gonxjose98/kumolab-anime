'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Google Analytics 4 — gated entirely behind NEXT_PUBLIC_GA_ID.
 *
 * When the env var is unset the component renders nothing: no gtag.js request,
 * no cookies, no data leaves the page (safe default for local/dev and until the
 * GA property exists). When set (G-XXXXXXX), the standard gtag snippet loads
 * after hydration (strategy="afterInteractive") and GA4's enhanced measurement
 * handles SPA page_view tracking via History-API changes.
 *
 * Admin routes are excluded: internal dashboard usage must not pollute site
 * analytics. (If a session starts on the public site and later navigates into
 * /admin, the already-loaded tag persists for that session — acceptable, since
 * admin entry is normally a direct /admin visit.)
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function GoogleAnalytics() {
    const pathname = usePathname();
    if (!GA_ID) return null;
    if (pathname?.startsWith('/admin')) return null;
    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
                strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${GA_ID}');
                `}
            </Script>
        </>
    );
}
