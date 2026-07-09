'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, ShoppingBag } from 'lucide-react';

// In-page section nav for the Store tab (Products · Orders). Sub-sections live
// here rather than in the sidebar so the rail stays lean. Future sections
// (Coupons) slot in as more items.
const SECTIONS = [
    { href: '/admin/store/products', label: 'Products', jp: 'グッズ', icon: ShoppingBag },
    { href: '/admin/store/orders', label: 'Orders', jp: '注文', icon: Package },
];

export default function StoreTabs() {
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
