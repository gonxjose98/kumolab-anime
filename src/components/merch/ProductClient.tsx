
'use client';

import { useState } from 'react';
import { useCartStore } from '@/store/useCartStore';
import styles from './ProductClient.module.css';

interface ProductClientProps {
    productData: any;
    anchorPrice?: number | null;  // cosmetic compare-at; never charged
    label?: string | null;        // e.g. 'Launch price'
}

export default function ProductClient({ productData, anchorPrice = null, label = null }: ProductClientProps) {
    const { sync_product, sync_variants } = productData;
    const [selectedVariant, setSelectedVariant] = useState(sync_variants[0]);
    const [quantity, setQuantity] = useState(1);
    const addItem = useCartStore((state) => state.addItem);

    const realPrice = parseFloat(selectedVariant.retail_price);
    const hasAnchor = anchorPrice != null && anchorPrice > realPrice;
    const pct = hasAnchor ? Math.round((1 - realPrice / anchorPrice) * 100) : 0;

    const handleAddToCart = () => {
        addItem({
            variantId: selectedVariant.id,
            productId: sync_product.id,
            name: selectedVariant.name,
            price: parseFloat(selectedVariant.retail_price),
            quantity: quantity,
            image: selectedVariant.files.find((f: any) => f.type === 'preview')?.thumbnail_url || sync_product.thumbnail_url,
            size: selectedVariant.size,
            color: selectedVariant.color,
        });
        alert('Added to cart!');
    };

    return (
        <div className={styles.productLayout}>
            <div className={styles.imageSection}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={selectedVariant.files.find((f: any) => f.type === 'preview')?.thumbnail_url || sync_product.thumbnail_url}
                    alt={sync_product.name}
                    className={styles.mainImage}
                />
            </div>

            <div className={styles.detailsSection}>
                <h1 className={styles.title}>{sync_product.name}</h1>
                <div className={styles.price} style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    {hasAnchor && (
                        <span style={{ textDecoration: 'line-through', opacity: 0.5, fontWeight: 400 }}>
                            ${anchorPrice!.toFixed(2)}
                        </span>
                    )}
                    <span>${realPrice.toFixed(2)}</span>
                    {hasAnchor && (
                        <span
                            style={{
                                background: '#e3002b', color: '#fff', fontSize: 13, fontWeight: 800,
                                letterSpacing: '0.04em', padding: '3px 10px', borderRadius: 6,
                            }}
                        >
                            {label ? `${label} · ` : ''}-{pct}%
                        </span>
                    )}
                </div>

                <div className={styles.variants}>
                    <h3>Select Style</h3>
                    <div className={styles.variantGrid}>
                        {sync_variants.map((v: any) => (
                            <button
                                key={v.id}
                                className={`${styles.variantBtn} ${selectedVariant.id === v.id ? styles.active : ''}`}
                                onClick={() => setSelectedVariant(v)}
                            >
                                {v.size} {v.color ? `(${v.color})` : ''}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.quantitySection}>
                    <h3>Quantity</h3>
                    <div className={styles.quantityControls}>
                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button>
                        <span>{quantity}</span>
                        <button onClick={() => setQuantity(quantity + 1)}>+</button>
                    </div>
                </div>

                <button className={styles.addToCartBtn} onClick={handleAddToCart}>
                    Add to Cart
                </button>
            </div>
        </div>
    );
}
