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

/**
 * Printful's thumbnail_url is a small thumb that blurs when shown large. The
 * same CDN asset is usually served at higher res as `_preview.<ext>`, so we
 * do a pure string swap (no extra API call). If the pattern doesn't match the
 * URL is returned untouched; the <img> onError falls back to the thumb.
 */
function upgradePrintfulImage(url: string): string {
    if (!url) return url;
    try {
        if (!new URL(url).hostname.endsWith('printful.com')) return url;
        return url.replace(/_thumb(\.(?:png|jpe?g|webp|gif))(\?.*)?$/i, '_preview$1$2');
    } catch {
        return url;
    }
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
            <Link href={`/merch/${product.id}`} className={`${styles.card} ${featured ? styles.cardFeatured : ''}`}>
                {featured && <span className={styles.flagChip}>The Flagship</span>}
                <div className={styles.cardHalo} aria-hidden="true" />
                <div className={styles.imageWrap}>
                    {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={upgradePrintfulImage(product.image)}
                            alt={cleanName(product.name)}
                            loading="lazy"
                            className={styles.image}
                            onError={(e) => {
                                // upgraded _preview 404'd → fall back to the thumb once
                                const img = e.currentTarget;
                                if (product.image && img.src !== product.image) img.src = product.image;
                            }}
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
                    <span className={styles.cardCta}>View this drop →</span>
                </div>
            </Link>
        </Reveal>
    );
}

/**
 * The Cloud Collection — merch band, #1 conversion surface.
 * Renders real products whenever the fetch returns any (getFeaturedProducts
 * already falls back to ALL products when nothing is flagged featured);
 * degrades to a graceful "condensing" state only when the catalogue is
 * genuinely empty (e.g. PRINTFUL_ACCESS_TOKEN missing in this environment).
 */
const CloudCollection = ({ products }: CloudCollectionProps) => {
    const items = products.slice(0, 4);
    // With the real first drop (sweatshirt + shirt) there are exactly two
    // pieces — lay them out as a balanced centered pair rather than a
    // lopsided row-span grid, so no empty cell / vertical gap remains.
    const few = items.length > 0 && items.length <= 2;

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
                    <div className={styles.scarcity}>
                        <span className={styles.scarcityDot} />
                        Limited first run. Once it sells through, it&apos;s gone.
                    </div>
                </Reveal>

                {items.length > 0 ? (
                    <div className={`${styles.grid} ${few ? styles.gridFew : ''}`}>
                        {items.map((p, i) => (
                            <ProductCard key={p.id} product={p} index={i} featured={!few && i === 0} />
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
