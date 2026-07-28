'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { rememberRoute } from '@/lib/admin/returnTo';

/**
 * Records the last admin route worth returning to, so the post editor's Back
 * goes where the operator actually came from (see lib/admin/returnTo).
 *
 * Mounted once in the admin layout rather than wired into every list page, so
 * new entry points into the editor get correct Back behaviour for free.
 * Renders nothing.
 */
export default function RouteMemory() {
    const pathname = usePathname();
    useEffect(() => {
        if (pathname) rememberRoute(pathname);
    }, [pathname]);
    return null;
}
