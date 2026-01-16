
'use client';

import { useState } from 'react';
import { useCartStore } from '@/store/useCartStore';
import styles from './ProductClient.module.css';

interface ProductClientProps {
    productData: any;
}

export default function ProductClient({ productData }: ProductClientProps) {
    const { sync_product, sync_variants } = productData;
    const [selectedVariant, setSelectedVariant] = useState(sync_variants[0]);
    const [quantity, setQuantity] = useState(1);
    const addItem = useCartStore((state) => state.addItem);

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
                <img
                    src={selectedVariant.files.find((f: any) => f.type === 'preview')?.thumbnail_url || sync_product.thumbnail_url}
                    alt={sync_product.name}
                    className={styles.mainImage}
                />
            </div>

            <div className={styles.detailsSection}>
                <h1 className={styles.title}>{sync_product.name}</h1>
                <p className={styles.price}>${selectedVariant.retail_price}</p>

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
