'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { captureUtm } from '@/lib/analytics/events';

/**
 * Records one page view per client-side navigation by POSTing to /api/track,
 * which writes via the service-role client. (The old version inserted into
 * page_views directly with the anon key — silently denied by RLS, so nothing
 * was ever recorded.) Bot detection + user-agent capture now happen server-side
 * from the real request headers.
 */
export function AnalyticsTracker() {
    const pathname = usePathname();
    const lastTrackedPath = useRef<string | null>(null);

    useEffect(() => {
        if (!pathname) return;
        // Never count admin routes.
        if (pathname.startsWith('/admin')) return;
        // Persist any UTM attribution on the landing URL (last-touch, 30d) so
        // downstream signups/purchases can be tied back to the campaign.
        captureUtm();
        // Guard against React strict-mode double-fire and same-path re-renders.
        if (lastTrackedPath.current === pathname) return;
        lastTrackedPath.current = pathname;

        // Fire-and-forget. keepalive lets the request survive a fast navigation
        // away from the page before it completes.
        try {
            fetch('/api/track', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path: pathname, referrer: document.referrer || null }),
                keepalive: true,
            }).catch(() => {
                // Never block or surface anything to the user.
            });
        } catch {
            // ignore — analytics must never break the page
        }
    }, [pathname]);

    return null; // renders nothing
}
