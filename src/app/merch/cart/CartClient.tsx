'use client';

import { useCartStore } from '@/store/useCartStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import styles from './cart.module.css';
import { useEffect, useMemo, useState } from 'react';

// Dropdown options; the server validates against the real ship list.
const COUNTRIES = [
    { code: 'US', label: 'United States' },
    { code: 'CA', label: 'Canada' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'AU', label: 'Australia' },
];

// initialCountry is geo-detected server-side (Vercel x-vercel-ip-country),
// so most customers land on the right country without touching the dropdown.
export default function CartClient({ initialCountry }: { initialCountry: string }) {
    const { items, removeItem, updateQuantity, getTotal } = useCartStore();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [country, setCountry] = useState(initialCountry);
    const [shipping, setShipping] = useState<number | null>(null);
    const [shipLoading, setShipLoading] = useState(false);
    const [shipError, setShipError] = useState<string | null>(null);

    const subtotal = getTotal();
    // Stable key so the estimate refetches when the cart contents or country change.
    const cartKey = useMemo(
        () => items.map((i) => `${i.variantId}x${i.quantity}`).join(','),
        [items],
    );

    useEffect(() => {
        if (items.length === 0) { setShipping(null); setShipError(null); return; }
        let cancelled = false;
        setShipLoading(true);
        setShipError(null);
        (async () => {
            try {
                const res = await fetch('/api/shipping-estimate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        countryCode: country,
                        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
                    }),
                });
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Could not estimate shipping');
                setShipping(typeof data.shipping === 'number' ? data.shipping : null);
            } catch (e: any) {
                if (!cancelled) { setShipping(null); setShipError(e?.message || 'Could not estimate shipping'); }
            } finally {
                if (!cancelled) setShipLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [cartKey, country, items]);

    const total = subtotal + (shipping ?? 0);
    const canCheckout = !isLoading && !shipLoading && shipping != null && !shipError;

    // Go to our own on-site checkout page (Stripe Embedded Checkout renders
    // there); the customer never leaves the site.
    const handleCheckout = () => {
        setIsLoading(true);
        router.push(`/merch/checkout?country=${encodeURIComponent(country)}`);
    };

    return (
        <SkyContentRoot>
            {items.length === 0 ? (
                <div className={styles.emptyContainer}>
                    <ShoppingBag size={64} className={styles.emptyIcon} />
                    <h1>Your cart is empty</h1>
                    <p>Looks like you haven&apos;t added any artifacts yet.</p>
                    <Link href="/merch" className={styles.continueBtn}>
                        Return to Collection
                    </Link>
                </div>
            ) : (
                <div className={styles.wrap}>
                    <h1 className={styles.pageTitle}>Your Cart</h1>

                    <div className={styles.cartLayout}>
                        <div className={styles.itemsList}>
                            {items.map((item) => (
                                <div key={item.variantId} className={styles.item}>
                                    <img src={item.image} alt={item.name} className={styles.itemImage} />
                                    <div className={styles.itemInfo}>
                                        <h3>{item.name}</h3>
                                        <p className={styles.itemMeta}>
                                            {item.size} {item.color ? `| ${item.color}` : ''}
                                        </p>
                                        <div className={styles.itemActions}>
                                            <div className={styles.quantity}>
                                                <button onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>-</button>
                                                <span>{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button>
                                            </div>
                                            <button onClick={() => removeItem(item.variantId)} className={styles.removeBtn}>
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className={styles.itemPrice}>
                                        ${(item.price * item.quantity).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.summary}>
                            <h2>Order Summary</h2>

                            <label className={styles.shipCountry}>
                                <span>Ship to</span>
                                <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={isLoading}>
                                    {COUNTRIES.map((c) => (
                                        <option key={c.code} value={c.code}>{c.label}</option>
                                    ))}
                                </select>
                            </label>

                            <div className={styles.summaryRow}>
                                <span>Subtotal</span>
                                <span>${subtotal.toFixed(2)}</span>
                            </div>
                            <div className={styles.summaryRow}>
                                <span>Shipping</span>
                                <span>
                                    {shipLoading
                                        ? 'Calculating…'
                                        : shipError
                                            ? 'Unavailable'
                                            : shipping != null
                                                ? `$${shipping.toFixed(2)}`
                                                : '—'}
                                </span>
                            </div>
                            <div className={`${styles.summaryRow} ${styles.total}`}>
                                <span>Total</span>
                                <span>${total.toFixed(2)}</span>
                            </div>

                            {shipError && (
                                <p className={styles.shipErr}>{shipError}. Please try again in a moment.</p>
                            )}

                            <button
                                className={styles.checkoutBtn}
                                onClick={handleCheckout}
                                disabled={!canCheckout}
                            >
                                {isLoading ? 'Processing...' : shipLoading ? 'Calculating shipping…' : 'Proceed to Checkout'}
                                {canCheckout && !isLoading && <ArrowRight size={20} />}
                            </button>

                            <p className={styles.checkoutNote}>
                                Shipping is calculated live from our print partner. Payments processed securely via Stripe.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            <SkyFooter />
        </SkyContentRoot>
    );
}
