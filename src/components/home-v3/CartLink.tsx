'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';
import p from './Pages.module.css';

/** Cart icon with item count; only shows when the cart has something in it. */
export default function CartLink() {
    const count = useCartStore((st) => st.items.reduce((n, i) => n + i.quantity, 0));
    // The cart lives in localStorage, so wait for mount to avoid a hydration mismatch.
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready || count === 0) return null;
    return (
        <Link href="/merch/cart" className={p.cart} aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
            <ShoppingCart size={21} aria-hidden="true" />
            <span className={p.cartBadge}>{count}</span>
        </Link>
    );
}
