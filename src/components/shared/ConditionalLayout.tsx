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

    return (
        <>
            {!isAdmin && nav}
            {children}
            {!isAdmin && footer}
        </>
    );
}
