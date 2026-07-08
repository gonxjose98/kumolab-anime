'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    FileText,
    CalendarDays,
    BarChart3,
    ShoppingBag,
    Menu,
} from 'lucide-react';
import LogoutButton from './LogoutButton';

const GROUPS: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
    { label: 'Overview', items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
    {
        label: 'Content',
        items: [
            { href: '/admin/posts', label: 'Posts', icon: FileText },
            { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
        ],
    },
    { label: 'Insights', items: [{ href: '/admin/analytics', label: 'Analytics', icon: BarChart3 }] },
    { label: 'Store', items: [{ href: '/admin/merch', label: 'Merch', icon: ShoppingBag }] },
];

const ALL = GROUPS.flatMap((g) => g.items);

/**
 * Clear Skies admin shell — persistent navy sidebar rail + frosted top bar.
 * Replaces the old hamburger AdminHeader. The rail collapses to a drawer
 * below 900px. Active item is derived from the pathname.
 */
export default function AdminShell({
    email,
    children,
}: {
    email?: string | null;
    children: React.ReactNode;
}) {
    const pathname = usePathname() || '';
    const [open, setOpen] = useState(false);

    const isActive = (href: string) => {
        if (href === '/admin/dashboard') return pathname === href;
        if (href === '/admin/posts') return pathname.startsWith('/admin/posts') || pathname.startsWith('/admin/post/');
        return pathname.startsWith(href);
    };
    const title = ALL.find((i) => isActive(i.href))?.label ?? 'Admin';

    // Close the drawer on route change
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    return (
        <div className="admin-root">
        <div className="ak-shell">
            <aside className={`ak-rail ${open ? 'ak-rail--open' : ''}`}>
                <Link href="/admin/dashboard" className="ak-rail__brand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/kumolab-cloud-mark-gold.png" alt="" />
                    <span className="ak-rail__brand-name">KumoLab</span>
                </Link>

                <nav className="ak-rail__nav">
                    {GROUPS.map((g) => (
                        <div key={g.label}>
                            <div className="ak-rail__group">{g.label}</div>
                            {g.items.map((it) => {
                                const Icon = it.icon;
                                const active = isActive(it.href);
                                return (
                                    <Link
                                        key={it.href}
                                        href={it.href}
                                        className={`ak-rail__item ${active ? 'ak-rail__item--active' : ''}`}
                                    >
                                        <Icon size={17} />
                                        <span>{it.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="ak-rail__foot">
                    {email && <div className="ak-rail__user">{email}</div>}
                    <LogoutButton />
                </div>
            </aside>

            {open && <div className="ak-rail__scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

            <div className="ak-main">
                <header className="ak-topbar">
                    <div className="flex items-center gap-3">
                        <button className="ak-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
                            <Menu size={18} />
                        </button>
                        <span className="ak-display" style={{ fontSize: '20px' }}>
                            {title}
                        </span>
                    </div>
                </header>
                <div className="ak-content">{children}</div>
            </div>
        </div>
        </div>
    );
}
