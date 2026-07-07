'use client';

import Link from 'next/link';
import type { Product } from '@/types';
import styles from './CloudCollection.module.css';
import { useReveal } from './useReveal';

interface CloudCollectionProps {
    products: Product[];
}

const formatPrice = (n: number) => `$${n.toFixed(2)}`;

const CloudCollection = ({ products }: CloudCollectionProps) => {
    const { ref, visible } = useReveal<HTMLElement>(0.12);

    const lineup = products.filter(p => p.image).slice(0, 4);
    const hero = lineup[0];
    const rest = lineup.slice(1);

    return (
        <section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
            {/* Section aurora glow */}
            <div className={styles.sectionGlow} aria-hidden="true" />

            <div className={styles.header}>
                <div className={styles.eyebrow}>初回限定ドロップ · FIRST DROP</div>
                <h2 className={styles.title}>The Cloud Collection</h2>
                <p className={styles.lede}>
                    Original KumoLab pieces, cut from the night sky. Limited first
                    run — when this drop sells out, it never re-runs.
                </p>
                <div className={styles.scarcity}>
                    <span className={styles.scarcityDot} />
                    Limited run · Live now
                </div>
            </div>

            {hero ? (
                <>
                    {/* Featured product — the conversion centerpiece */}
                    <Link href="/merch" className={styles.heroCard}>
                        <div className={styles.heroArtWrap}>
                            <div className={styles.heroPedestal} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={hero.image}
                                alt={hero.name}
                                className={styles.heroArt}
                                loading="lazy"
                            />
                        </div>
                        <div className={styles.heroInfo}>
                            {hero.label && <span className={styles.labelChip}>{hero.label}</span>}
                            <h3 className={styles.heroName}>{hero.name}</h3>
                            <div className={styles.priceRow}>
                                {hero.anchorPrice != null && hero.anchorPrice > hero.price && (
                                    <span className={styles.anchorPrice}>
                                        {formatPrice(hero.anchorPrice)}
                                    </span>
                                )}
                                <span className={styles.price}>{formatPrice(hero.price)}</span>
                            </div>
                            <span className={styles.heroCtaBtn}>
                                <span className={styles.heroCtaShine} />
                                Shop the Collection
                            </span>
                            <span className={styles.trustLine}>
                                Ships worldwide · Printed on demand · 雲ラボ製
                            </span>
                        </div>
                    </Link>

                    {/* Supporting lineup */}
                    {rest.length > 0 && (
                        <div className={styles.grid}>
                            {rest.map((p, i) => (
                                <Link
                                    key={p.id}
                                    href="/merch"
                                    className={styles.card}
                                    style={{ '--d': `${0.15 + i * 0.12}s` } as React.CSSProperties}
                                >
                                    <div className={styles.cardArtWrap}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={p.image}
                                            alt={p.name}
                                            className={styles.cardArt}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className={styles.cardInfo}>
                                        <span className={styles.cardName}>{p.name}</span>
                                        <span className={styles.cardPriceRow}>
                                            {p.anchorPrice != null && p.anchorPrice > p.price && (
                                                <span className={styles.anchorPriceSm}>
                                                    {formatPrice(p.anchorPrice)}
                                                </span>
                                            )}
                                            <span className={styles.cardPrice}>{formatPrice(p.price)}</span>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* Graceful fallback if Printful is unreachable in this env */
                <div className={styles.fallback}>
                    <div className={styles.fallbackCloud}>
                        <svg viewBox="0 0 64 40" width="72" height="45" fill="none" aria-hidden="true">
                            <path
                                d="M50 34H16a10 10 0 1 1 2.3-19.7A14 14 0 0 1 45 12a11 11 0 0 1 5 22Z"
                                stroke="rgba(160,180,255,0.55)"
                                strokeWidth="2"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    <p className={styles.fallbackText}>The first drop is condensing…</p>
                    <Link href="/merch" className={styles.heroCtaBtn}>
                        <span className={styles.heroCtaShine} />
                        Shop the Collection
                    </Link>
                </div>
            )}

            <div className={styles.footRow}>
                <Link href="/merch" className={styles.viewAll}>
                    View the full drop →
                </Link>
            </div>
        </section>
    );
};

export default CloudCollection;
