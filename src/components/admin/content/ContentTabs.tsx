'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, CalendarClock, CalendarDays } from 'lucide-react';

const SECTIONS = [
    { href: '/admin/content/posts', label: 'Posts', jp: '記事', icon: FileText },
    { href: '/admin/content/schedule', label: 'Schedule', jp: '予定', icon: CalendarClock },
    { href: '/admin/content/calendar', label: 'Calendar', jp: '暦', icon: CalendarDays },
];

export default function ContentTabs() {
    const pathname = usePathname() || '';
    return (
        <div className="ak-subtabs">
            {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = pathname.startsWith(s.href);
                return (
                    <Link key={s.href} href={s.href} className={`ak-subtab ${active ? 'ak-subtab--active' : ''}`}>
                        <Icon size={15} strokeWidth={1.9} />
                        <span>{s.label}</span>
                        <span className="ak-subtab__jp">{s.jp}</span>
                    </Link>
                );
            })}
        </div>
    );
}
