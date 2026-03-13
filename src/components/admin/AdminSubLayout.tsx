'use client';

import Link from 'next/link';

interface AdminSubLayoutProps {
    title: string;
    subtitle?: string;
    accentColor: string;
    icon: string;
    children: React.ReactNode;
}

export default function AdminPageHeader({ title, subtitle, accentColor, icon }: Omit<AdminSubLayoutProps, 'children'>) {
    return (
        <div className="mb-6">
            <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider mb-4 transition-colors hover:opacity-80"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Back to Dashboard
            </Link>
            <div className="flex items-center gap-3">
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}30` }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={icon} />
                    </svg>
                </div>
                <div>
                    <h1
                        className="text-xl font-bold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
