'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe-client';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import styles from './checkout.module.css';

/**
 * On-site checkout: Stripe's Embedded Checkout renders the payment + address
 * form in a component on our page, so the customer never leaves the site.
 * The session (with server-recomputed price + shipping, locked to `country`)
 * is created by /api/checkout; on completion Stripe returns them to
 * /merch/success. The webhook + manual order-approval flow are unchanged.
 */
export default function CheckoutClient({ country }: { country: string }) {
    const hasItems = useCartStore((s) => s.items.length > 0);

    // Read the cart at call time (stable identity) so the provider never
    // re-creates the session mid-flow.
    const fetchClientSecret = useCallback(async () => {
        const items = useCartStore.getState().items;
        const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, countryCode: country }),
        });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) throw new Error(data.error || 'Could not start checkout');
        return data.clientSecret as string;
    }, [country]);

    return (
        <SkyContentRoot>
            <div className={styles.wrap}>
                <div className={styles.head}>
                    <h1 className={styles.title}>Checkout</h1>
                    <Link href="/merch/cart" className={styles.back}>← Back to cart</Link>
                </div>

                {hasItems ? (
                    <div className={styles.embed}>
                        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
                            <EmbeddedCheckout />
                        </EmbeddedCheckoutProvider>
                    </div>
                ) : (
                    <div className={styles.empty}>
                        <p>Your cart is empty.</p>
                        <Link href="/merch" className={styles.back}>Return to Collection</Link>
                    </div>
                )}
            </div>
            <SkyFooter />
        </SkyContentRoot>
    );
}
