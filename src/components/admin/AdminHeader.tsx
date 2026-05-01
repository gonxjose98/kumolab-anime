'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

const NAV: Array<{ href: string; label: string }> = [
    { href: '/admin/dashboard', label: 'Console' },
    { href: '/admin/posts', label: 'Posts' },
    { href: '/admin/calendar', label: 'Calendar' },
];

/**
 * Shared admin header. KumoLab brand on the left, three-tab navigation in the
 * middle, account state on the right. Visible on every protected admin page.
 *
 * The post editor (`/admin/post/[id]`) is a sub-route reached by clicking a
 * post card, so it doesn't get its own tab — we highlight Posts when the user
 * is in the editor since that's where they came from.
 */
export default function AdminHeader({ userEmail }: { userEmail?: string | null }) {
    const pathname = usePathname() || '';

    const isActive = (href: string) => {
        if (href === '/admin/dashboard') return pathname === href;
        if (href === '/admin/posts') return pathname.startsWith('/admin/posts') || pathname.startsWith('/admin/post/');
        return pathname.startsWith(href);
    };

    return (
        <header
            className="px-5 py-3 flex items-center gap-4 backdrop-blur-2xl sticky top-0 z-50"
            style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border-subtle)' }}
        >
            {/* Brand */}
            <Link href="/admin/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity group shrink-0">
                <div className="relative">
                    <div
                        className="absolute -inset-1 rounded-lg opacity-40 group-hover:opacity-70 transition-opacity"
                        style={{ background: 'linear-gradient(135deg, #00d4ff, #7b61ff, #ff3cac)', filter: 'blur(6px)' }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="" className="h-7 w-auto relative dark:invert dark:brightness-200" />
                </div>
                <div className="hidden sm:flex flex-col leading-tight">
                    <span
                        className="text-sm font-bold tracking-tight"
                        style={{
                            fontFamily: 'var(--font-display)',
                            background: 'linear-gradient(135deg, #00d4ff, #7b61ff)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        KUMOLAB
                    </span>
                    <span
                        className="text-[8px] font-bold uppercase tracking-[0.3em]"
                        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}
                    >
                        Console
                    </span>
                </div>
            </Link>

            {/* Tabs */}
            <nav className="flex items-center gap-1 flex-1 justify-center md:justify-start md:ml-6">
                {NAV.map(item => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.18em] transition-all"
                            style={{
                                fontFamily: 'var(--font-display)',
                                background: active
                                    ? 'linear-gradient(135deg, rgba(0,212,255,0.10), rgba(123,97,255,0.12))'
                                    : 'transparent',
                                border: `1px solid ${active ? 'rgba(123,97,255,0.30)' : 'rgba(255,255,255,0.04)'}`,
                                color: active ? '#fff' : 'var(--text-tertiary)',
                                boxShadow: active ? '0 0 12px rgba(123,97,255,0.18)' : 'none',
                            }}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Account */}
            <div className="flex items-center gap-3 shrink-0">
                {userEmail && (
                    <div
                        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: '#00d4ff', animation: 'livePulse 2s ease-in-out infinite' }}
                        />
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                            {userEmail}
                        </span>
                    </div>
                )}
                <LogoutButton />
            </div>
        </header>
    );
}
