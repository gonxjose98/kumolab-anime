'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const MENU_ITEMS = [
    { key: 'tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', color: '#00d4ff', href: '/admin/tasks' },
    { key: 'agents', label: 'Agents', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: '#7b61ff', href: '/admin/agents' },
    { key: 'approvals', label: 'Approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#00ff88', href: '/admin/approvals' },
    { key: 'logs', label: 'Logs', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', color: '#ff6b35', href: '/admin/logs' },
    { key: 'calendar', label: 'Calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: '#ff3cac', href: '/admin/calendar' },
    { key: 'docs', label: 'Docs', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', color: '#ffaa00', href: '/admin/docs' },
];

export default function HamburgerMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        function handleEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') setIsOpen(false);
        }
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, []);

    const navigate = (href: string) => {
        setIsOpen(false);
        router.push(href);
    };

    return (
        <div ref={menuRef} className="relative">
            {/* Hamburger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300 hover:scale-105"
                style={{
                    background: isOpen ? 'rgba(123,97,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: isOpen ? '1px solid rgba(123,97,255,0.3)' : '1px solid rgba(255,255,255,0.05)',
                }}
                aria-label="Navigation menu"
            >
                <div className="flex flex-col items-center justify-center gap-[3px] w-4">
                    <span
                        className="block w-full h-[1.5px] rounded-full transition-all duration-300"
                        style={{
                            background: isOpen ? '#7b61ff' : 'var(--text-tertiary)',
                            transform: isOpen ? 'rotate(45deg) translate(1.5px, 1.5px)' : 'none',
                            width: isOpen ? '14px' : '16px',
                        }}
                    />
                    <span
                        className="block h-[1.5px] rounded-full transition-all duration-300"
                        style={{
                            background: 'var(--text-tertiary)',
                            opacity: isOpen ? 0 : 1,
                            width: '12px',
                        }}
                    />
                    <span
                        className="block w-full h-[1.5px] rounded-full transition-all duration-300"
                        style={{
                            background: isOpen ? '#7b61ff' : 'var(--text-tertiary)',
                            transform: isOpen ? 'rotate(-45deg) translate(1.5px, -1.5px)' : 'none',
                            width: isOpen ? '14px' : '10px',
                        }}
                    />
                </div>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-[100]"
                    style={{
                        background: 'rgba(12, 12, 24, 0.95)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(123,97,255,0.08)',
                        animation: 'menuSlideIn 0.2s ease-out',
                    }}
                >
                    <div className="p-1.5">
                        <div className="px-3 py-2 mb-1">
                            <span className="text-[8px] font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                Navigation
                            </span>
                        </div>
                        {MENU_ITEMS.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => navigate(item.href)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
                                    style={{
                                        background: isActive ? `${item.color}12` : 'transparent',
                                        border: isActive ? `1px solid ${item.color}25` : '1px solid transparent',
                                    }}
                                >
                                    <div
                                        className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200 group-hover:scale-110"
                                        style={{
                                            background: `${item.color}15`,
                                            border: `1px solid ${item.color}30`,
                                        }}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d={item.icon} />
                                        </svg>
                                    </div>
                                    <span
                                        className="text-[11px] font-bold uppercase tracking-wider transition-colors"
                                        style={{
                                            fontFamily: 'var(--font-display)',
                                            color: isActive ? item.color : 'var(--text-secondary)',
                                        }}
                                    >
                                        {item.label}
                                    </span>
                                    {isActive && (
                                        <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {/* Back to Dashboard */}
                    <div className="px-1.5 pb-1.5">
                        <div className="h-px mx-2 my-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        <button
                            onClick={() => navigate('/admin/dashboard')}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
                            style={{ background: pathname === '/admin/dashboard' ? 'rgba(0,212,255,0.08)' : 'transparent' }}
                        >
                            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                                </svg>
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-tertiary)' }}>
                                Dashboard
                            </span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
