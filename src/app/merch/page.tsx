import Link from 'next/link';
import { getFeaturedProducts } from '@/lib/merch';
import styles from './merch.module.css';

export const dynamic = 'force-dynamic';

export default async function MerchPage() {
    // Single-hero model: only featured products are shown.
    const products = await getFeaturedProducts();

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>The Collection</h1>
                <p className={styles.subtitle}>Curated artifacts for the discerning collector.</p>
            </header>

            <div className={styles.grid}>
                {products.map((product) => {
                    // Anchor is cosmetic only — show it struck-through above the
                    // live (charged) price when it's genuinely higher.
                    const hasAnchor = product.anchorPrice != null && product.anchorPrice > product.price;
                    const pct = hasAnchor
                        ? Math.round((1 - product.price / (product.anchorPrice as number)) * 100)
                        : 0;
                    return (
                        <Link href={`/merch/${product.id}`} key={product.id} className={styles.card}>
                            <div className={styles.imageWrapper} style={{ position: 'relative' }}>
                                <img src={product.image} alt={product.name} className={styles.image} />
                                {hasAnchor && (
                                    <span
                                        style={{
                                            position: 'absolute', top: 10, left: 10,
                                            background: '#e3002b', color: '#fff',
                                            fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                                            padding: '4px 8px', borderRadius: 6, zIndex: 2,
                                        }}
                                    >
                                        {product.label ? `${product.label} · ` : ''}-{pct}%
                                    </span>
                                )}
                            </div>
                            <div className={styles.info}>
                                <h3 className={styles.name}>{product.name}</h3>
                                <span className={styles.price}>
                                    {hasAnchor && (
                                        <span style={{ textDecoration: 'line-through', opacity: 0.5, marginRight: 8 }}>
                                            ${(product.anchorPrice as number).toFixed(2)}
                                        </span>
                                    )}
                                    ${product.price.toFixed(2)}
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
