'use client';

import Link from 'next/link';
import { Product } from '@/types';
import { Reveal } from './motion';
import styles from './CloudCollection.module.css';

interface CloudCollectionProps {
    products: Product[];
}

/** Printful names can carry store suffixes — keep them elegant. */
function cleanName(name: string): string {
    return name.replace(/\s*[|·]\s*KumoLab.*$/i, '').trim();
}

function ProductCard({
    product,
    index,
    featured,
}: {
    product: Product;
    index: number;
    featured: boolean;
}) {
    return (
        <Reveal delay={0.1 + index * 0.12} className={featured ? styles.cellFeatured : styles.cell}>
            <Link href="/merch" className={`${styles.card} ${featured ? styles.cardFeatured : ''}`}>
                {featured && <span className={styles.flagChip}>The Flagship</span>}
                <div className={styles.cardHalo} aria-hidden="true" />
                <div className={styles.imageWrap}>
                    {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={product.image}
                            alt={cleanName(product.name)}
                            loading="lazy"
                            className={styles.image}
                        />
                    ) : (
                        <div className={styles.imageFallback}>雲</div>
                    )}
                    <div className={styles.cloudPedestal} aria-hidden="true" />
                </div>
                <div className={styles.cardBody}>
                    <h3 className={styles.cardName}>{cleanName(product.name)}</h3>
                    <div className={styles.priceRow}>
                        <span className={styles.price}>${product.price.toFixed(2)}</span>
                        {product.anchorPrice != null && product.anchorPrice > product.price && (
                            <span className={styles.anchor}>${product.anchorPrice.toFixed(2)}</span>
                        )}
                        {product.label && <span className={styles.labelChip}>{product.label}</span>}
                    </div>
                    <span className={styles.cardCta}>View in the shop →</span>
                </div>
            </Link>
        </Reveal>
    );
}

const CloudCollection = ({ products }: CloudCollectionProps) => {
    const items = products.slice(0, 4);

    return (
        <section className={styles.section}>
            <div className={styles.glow} aria-hidden="true" />

            <div className={styles.inner}>
                <Reveal>
                    <div className={styles.kicker}>第一便 · First Drop</div>
                </Reveal>
                <Reveal delay={0.08}>
                    <h2 className={styles.title}>The Cloud Collection</h2>
                </Reveal>
                <Reveal delay={0.16}>
                    <p className={styles.sub}>
                        Original KumoLab pieces, released as a single first run.
                        Designed above the clouds — worn down here.
                    </p>
                </Reveal>
                <Reveal delay={0.22}>
                    <div className={styles.scarcity}>
                        <span className={styles.scarcityDot} />
                        Limited first run — once it sells through, it&apos;s gone.
                    </div>
                </Reveal>

                {items.length > 0 ? (
                    <div className={styles.grid}>
                        {items.map((p, i) => (
                            <ProductCard key={p.id} product={p} index={i} featured={i === 0} />
                        ))}
                    </div>
                ) : (
                    <Reveal delay={0.3}>
                        <div className={styles.empty}>
                            <div className={styles.emptyKanji}>雲</div>
                            <p>The first drop is condensing. Landing very soon.</p>
                        </div>
                    </Reveal>
                )}

                <Reveal delay={0.2}>
                    <Link href="/merch" className={styles.shopCta}>
                        <span className={styles.shopShine} />
                        <span>Shop the Collection</span>
                    </Link>
                </Reveal>
            </div>
        </section>
    );
};

export default CloudCollection;
