
'use client';

import { useCartStore } from '@/store/useCartStore';
import Link from 'next/link';
import { ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import styles from './cart.module.css';
import { useState } from 'react';

export default function CartPage() {
    const { items, removeItem, updateQuantity, getTotal } = useCartStore();
    const [isLoading, setIsLoading] = useState(false);

    const handleCheckout = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });

            const { url, error } = await response.json();
            if (error) throw new Error(error);
            if (url) window.location.href = url; // Redirect to Stripe Checkout
        } catch (error: any) {
            console.error('Checkout failed:', error);
            alert('Checkout failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className={styles.emptyContainer}>
                <ShoppingBag size={64} className={styles.emptyIcon} />
                <h1>Your cart is empty</h1>
                <p>Looks like you haven&apos;t added any artifacts yet.</p>
                <Link href="/merch" className={styles.continueBtn}>
                    Return to Collection
                </Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-12 min-h-screen">
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
                    <div className={styles.summaryRow}>
                        <span>Subtotal</span>
                        <span>${getTotal().toFixed(2)}</span>
                    </div>
                    <div className={styles.summaryRow}>
                        <span>Shipping</span>
                        <span>Calculated at checkout</span>
                    </div>
                    <div className={`${styles.summaryRow} ${styles.total}`}>
                        <span>Total</span>
                        <span>${getTotal().toFixed(2)}</span>
                    </div>

                    <button
                        className={styles.checkoutBtn}
                        onClick={handleCheckout}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Processing...' : 'Proceed to Checkout'}
                        {!isLoading && <ArrowRight size={20} />}
                    </button>

                    <p className={styles.checkoutNote}>
                        Payments processed securely via Stripe.
                    </p>
                </div>
            </div>
        </div>
    );
}
