'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import LogoutButton from './LogoutButton';

const NAV: Array<{ href: string; label: string }> = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/posts', label: 'Posts' },
    { href: '/admin/calendar', label: 'Calendar' },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/merch', label: 'Merch' },
];

/**
 * Shared admin header. KumoLab brand on the left, hamburger nav dropdown,
 * account state on the right. The dropdown holds Dashboard / Posts /
 * Calendar / Analytics; Dashboard is the default landing.
 *
 * The post editor (`/admin/post/[id]`) is a sub-route reached by clicking a
 * post card, so it doesn't get its own entry — Posts is highlighted as
 * active when the user is in the editor.
 */
export default function AdminHeader({ userEmail }: { userEmail?: string | null }) {
    const pathname = usePathname() || '';
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isActive = (href: string) => {
        if (href === '/admin/dashboard') return pathname === href;
        if (href === '/admin/posts') return pathname.startsWith('/admin/posts') || pathname.startsWith('/admin/post/');
        return pathname.startsWith(href);
    };

    const currentLabel = NAV.find(n => isActive(n.href))?.label ?? 'Dashboard';

    // Close on outside click + Escape
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Close when route changes
    useEffect(() => { setOpen(false); }, [pathname]);

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
                        Dashboard
                    </span>
                </div>
            </Link>

            {/* Hamburger nav */}
            <div ref={dropdownRef} className="relative flex-1 flex justify-start md:ml-4">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label="Open navigation"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
                    style={{
                        fontFamily: 'var(--font-display)',
                        background: open
                            ? 'linear-gradient(135deg, rgba(0,212,255,0.10), rgba(123,97,255,0.12))'
                            : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${open ? 'rgba(123,97,255,0.30)' : 'rgba(255,255,255,0.06)'}`,
                        boxShadow: open ? '0 0 12px rgba(123,97,255,0.18)' : 'none',
                        color: open ? '#fff' : 'var(--text-tertiary)',
                    }}
                >
                    {open ? <X size={14} /> : <Menu size={14} />}
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em]">{currentLabel}</span>
                </button>

                {open && (
                    <div
                        role="menu"
                        className="absolute left-0 top-full mt-2 min-w-[200px] rounded-xl overflow-hidden"
                        style={{
                            background: 'rgba(12, 12, 24, 0.95)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            backdropFilter: 'blur(20px)',
                            boxShadow: '0 12px 36px rgba(0,0,0,0.45), 0 0 24px rgba(123,97,255,0.08)',
                        }}
                    >
                        {NAV.map(item => {
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    role="menuitem"
                                    onClick={() => setOpen(false)}
                                    className="block px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors"
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        background: active
                                            ? 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(123,97,255,0.14))'
                                            : 'transparent',
                                        color: active ? '#fff' : 'var(--text-tertiary)',
                                        borderLeft: `2px solid ${active ? '#7b61ff' : 'transparent'}`,
                                    }}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

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
