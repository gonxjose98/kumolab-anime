'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, Image as ImageIcon } from 'lucide-react';

const SECTIONS = [
    { href: '/admin/studio/videos', label: 'Videos', jp: '動画', icon: Clapperboard },
    { href: '/admin/studio/images', label: 'Images', jp: '画像', icon: ImageIcon },
];

export default function StudioTabs() {
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
