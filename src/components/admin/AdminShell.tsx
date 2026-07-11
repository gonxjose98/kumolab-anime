'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    FileText,
    BarChart3,
    Store,
    Clapperboard,
    Users,
    Menu,
} from 'lucide-react';
import LogoutButton from './LogoutButton';
import ThemeToggle from './ThemeToggle';
import AdminSky from './AdminSky';

// perm = the permission a member needs to see this tab (owner always sees all).
// Undefined perm = always visible to any signed-in user. ownerOnly = owner only.
interface NavItem { href: string; label: string; jp: string; icon: typeof LayoutDashboard; perm?: string; ownerOnly?: boolean }

// Dashboard sits alone at the top (it's the room you're in, not a category);
// the rest are bilingual groups — Publishing / Insight / Shop / Admin.
const TOP: NavItem = { href: '/admin/dashboard', label: 'Dashboard', jp: '本部', icon: LayoutDashboard };

const GROUPS: { label: string; jp: string; items: NavItem[] }[] = [
    {
        label: 'Publishing', jp: '発信', items: [
            { href: '/admin/content', label: 'Content', jp: '記事', icon: FileText, perm: 'content' },
            { href: '/admin/studio', label: 'Studio', jp: '制作', icon: Clapperboard, perm: 'studio' },
        ],
    },
    { label: 'Insight', jp: '観測', items: [{ href: '/admin/analytics', label: 'Analytics', jp: '分析', icon: BarChart3, perm: 'analytics' }] },
    { label: 'Shop', jp: '売店', items: [{ href: '/admin/store', label: 'Store', jp: '売店', icon: Store, perm: 'store' }] },
    { label: 'Admin', jp: '管理', items: [{ href: '/admin/team', label: 'Team', jp: '班', icon: Users, ownerOnly: true }] },
];

const ALL = [TOP, ...GROUPS.flatMap((g) => g.items)];

/** The KumoLab admin shell — a gold-chrome cloud rail over the sea-to-sky. */
export default function AdminShell({
    email,
    perms,
    isOwner = false,
    children,
}: {
    email?: string | null;
    perms?: Record<string, boolean>;
    isOwner?: boolean;
    children: React.ReactNode;
}) {
    const pathname = usePathname() || '';
    const [open, setOpen] = useState(false);

    // Show a tab only if the member holds its permission (owner sees all).
    // Undefined perm = always visible; ownerOnly = owner only.
    const canSee = (it: NavItem) =>
        it.ownerOnly ? isOwner : (!it.perm || isOwner || !!perms?.[it.perm]);
    const visibleGroups = GROUPS
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0);

    const isActive = (href: string) => {
        if (href === '/admin/dashboard') return pathname === href;
        // The video editor (/admin/post/[id]/studio) lights up Studio, not Posts.
        if (href === '/admin/studio') return pathname.startsWith('/admin/studio') || pathname.endsWith('/studio');
        // Content owns the old Posts + Calendar routes and the post editor.
        if (href === '/admin/content') return (pathname.startsWith('/admin/content') || pathname.startsWith('/admin/posts') || pathname.startsWith('/admin/post/') || pathname.startsWith('/admin/calendar')) && !pathname.endsWith('/studio');
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
                        {visibleGroups.map((g) => (
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
