'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/store/useCartStore';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import styles from './success.module.css';

export default function SuccessPage() {
    const clearCart = useCartStore((state) => state.clearCart);

    useEffect(() => {
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
