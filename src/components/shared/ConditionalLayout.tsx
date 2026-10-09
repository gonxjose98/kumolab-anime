'use client';

import { usePathname } from 'next/navigation';

export default function ConditionalLayout({
    nav,
    footer,
    children,
}: {
    nav: React.ReactNode;
    footer: React.ReactNode;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isAdmin = pathname?.startsWith('/admin');
    // The link-in-bio hub (/links) is a focused, nav-free landing for social
    // bio traffic; it renders its own full-bleed layout.
    // Pages on the home v3 theme render their own nav + footer.
    const V3_PAGES = ['/home-v3', '/blog', '/merch', '/about', '/privacy', '/terms'];
    const isBare = isAdmin || pathname === '/links' || V3_PAGES.includes(pathname || '');

    return (
        <>
            {!isBare && nav}
            {children}
            {!isBare && footer}
        </>
    );
}
