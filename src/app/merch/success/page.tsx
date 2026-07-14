'use client';

import { useEffect, useRef } from 'react';
import { useCartStore } from '@/store/useCartStore';
import { trackEvent } from '@/lib/analytics/events';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import styles from './success.module.css';

export default function SuccessPage() {
    const clearCart = useCartStore((state) => state.clearCart);
    const fired = useRef(false);

    useEffect(() => {
        // Record the purchase BEFORE clearing the cart, once. Reading state
        // directly (not via a hook dep) captures the just-purchased items.
        if (!fired.current) {
            fired.current = true;
            const items = useCartStore.getState().items;
            if (items.length > 0) {
                trackEvent('purchase', {
                    value: items.reduce((t, i) => t + i.price * i.quantity, 0),
                    meta: { itemCount: items.reduce((n, i) => n + i.quantity, 0) },
                });
            }
        }
        clearCart();
    }, [clearCart]);

    return (
        <SkyContentRoot>
            <div className={styles.wrap}>
                <CheckCircle size={80} className={styles.icon} />
                <h1 className={styles.title}>Order Confirmed!</h1>
                <p className={styles.message}>
                    Thank you for your purchase. We&apos;ve sent a confirmation email to your inbox
                    and are preparing your artifacts for shipment.
                </p>
                <div className={styles.actions}>
                    <Link href="/merch" className={styles.primary}>
                        Back to Shop
                    </Link>
                    <Link href="/" className={styles.secondary}>
                        Home
                    </Link>
                </div>
            </div>
            <SkyFooter />
        </SkyContentRoot>
    );
}
