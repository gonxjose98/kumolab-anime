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
import ThemeToggle from './ThemeToggle';
import AdminSky from './AdminSky';

interface NavItem { href: string; label: string; jp: string; icon: typeof LayoutDashboard }

// Dashboard sits alone at the top (it's the room you're in, not a category);
// the rest are bilingual groups — Publishing / Insight / Shop.
const TOP: NavItem = { href: '/admin/dashboard', label: 'Dashboard', jp: '本部', icon: LayoutDashboard };

const GROUPS: { label: string; jp: string; items: NavItem[] }[] = [
    {
        label: 'Publishing', jp: '発信', items: [
            { href: '/admin/posts', label: 'Posts', jp: '記事', icon: FileText },
            { href: '/admin/calendar', label: 'Calendar', jp: '暦', icon: CalendarDays },
        ],
    },
    { label: 'Insight', jp: '観測', items: [{ href: '/admin/analytics', label: 'Analytics', jp: '分析', icon: BarChart3 }] },
    { label: 'Shop', jp: '売店', items: [{ href: '/admin/merch', label: 'Merch', jp: 'グッズ', icon: ShoppingBag }] },
];

const ALL = [TOP, ...GROUPS.flatMap((g) => g.items)];

/** The KumoLab admin shell — a gold-chrome cloud rail over the sea-to-sky. */
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
    const titleJp = ALL.find((i) => isActive(i.href))?.jp ?? '';

    useEffect(() => { setOpen(false); }, [pathname]);

    const NavRow = ({ it }: { it: NavItem }) => {
        const Icon = it.icon;
        const active = isActive(it.href);
        return (
            <Link href={it.href} className={`ak-rail__item ${active ? 'ak-rail__item--active' : ''}`}>
                <Icon size={18} strokeWidth={1.75} />
                <span className="ak-rail__labels">
                    <span className="ak-rail__main">{it.label}</span>
                    <span className="ak-rail__jp">{it.jp}</span>
                </span>
            </Link>
        );
    };

    return (
        <div className="admin-root">
            <AdminSky />
            <div className="ak-shell">
                <aside className={`ak-rail ${open ? 'ak-rail--open' : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <Link href="/admin/dashboard" className="ak-rail__crest">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/kumolab-cloud-mark-gold.png" alt="" />
                        <span className="ak-rail__brand">
                            <span className="ak-rail__brandname">KumoLab</span>
                            <span className="ak-rail__brandsub">Admin Console</span>
                        </span>
                    </Link>
                    <div className="ak-rail__crestline">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/kumolab-cloud-mark-gold.png" alt="" />
                    </div>

                    <nav className="ak-rail__nav">
                        <NavRow it={TOP} />
                        {GROUPS.map((g) => (
                            <div key={g.label} className="ak-rail__group-wrap">
                                <div className="ak-rail__group">
                                    <span className="ak-rail__group-en">{g.label}</span>
                                    <span className="ak-rail__group-jp">{g.jp}</span>
                                </div>
                                {g.items.map((it) => <NavRow key={it.href} it={it} />)}
                            </div>
                        ))}
                    </nav>

                    <div className="ak-rail__foot">
                        <ThemeToggle />
                        {email && (
                            <div className="ak-rail__user">
                                <span className="ak-rail__avatar">{(email[0] || 'K').toUpperCase()}</span>
                                <span className="ak-rail__email">{email}</span>
                            </div>
                        )}
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
                            <span className="ak-topbar__title">
                                {titleJp && <span className="ak-topbar__jp">{titleJp}</span>}
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
