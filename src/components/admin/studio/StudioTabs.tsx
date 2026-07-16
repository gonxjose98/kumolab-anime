'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, Folder, Image as ImageIcon } from 'lucide-react';

const SECTIONS = [
    { href: '/admin/studio/videos', label: 'Videos', jp: '動画', icon: Clapperboard },
    { href: '/admin/studio/images', label: 'Images', jp: '画像', icon: ImageIcon },
    // Raw-asset folders (loose pictures/videos) — distinct from the post Library.
    { href: '/admin/studio/media', label: 'Media', jp: '素材', icon: Folder },
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
