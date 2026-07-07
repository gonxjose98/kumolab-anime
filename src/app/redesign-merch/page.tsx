import type { Metadata } from 'next';
import Link from 'next/link';
import { getVisibleProducts } from '@/lib/merch';
import { Product } from '@/types';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import SkyMerchImage from './SkyMerchImage';
import styles from './SkyMerch.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
    title: 'KumoLab — The Collection (Redesign Preview: Sky)',
    description:
        'Preview of the KumoLab storefront on the content-page sky theme — small-batch cloud goods on a calm cel-shaded sky (bright day / starlit night).',
    robots: { index: false, follow: false },
};

/**
 * Printful's `thumbnail_url` is a low-res thumb that blurs when shown
 * large. The same CDN asset is commonly served at higher resolution as
 * `_preview.<ext>`, so we do a pure string transform (no extra API call):
 * `…_thumb.png` → `…_preview.png`, only on printful.com hosts. If the
 * pattern doesn't match, the URL is returned untouched — and the client
 * <SkyMerchImage> falls back to the original thumb (then a 雲 tile) if
 * the upgraded URL ever 404s, so the page can never break on images.
 */
function upgradePrintfulImage(url: string): string {
    if (!url) return url;
    try {
        const host = new URL(url).hostname;
        if (!host.endsWith('printful.com')) return url;
        return url.replace(/_thumb(\.(?:png|jpe?g|webp|gif))(\?.*)?$/i, '_preview$1$2');
    } catch {
        return url;
    }
}

/**
 * /redesign-merch — non-destructive themed preview of the storefront.
 * The real featured products (live Printful via getFeaturedProducts)
 * rendered as large boutique glass cards on the reusable content-page
 * sky theme. Cards link to the REAL /merch/[id] detail pages, which are
 * never touched. Follows the /redesign-blog exemplar exactly.
 */
export default async function RedesignMerchPage() {
    let products: Product[] = [];

    try {
        // The merch tab carries the whole catalogue (home features a subset).
        products = await getVisibleProducts();
    } catch (error) {
        console.error('[redesign-merch] Failed to fetch products:', error);
    }

    return (
        <SkyContentRoot>
            <header className={styles.hero}>
                <p className={styles.kicker}>限定 · Limited Cloud Goods</p>
                <h1 className={styles.title}>The Collection</h1>
                <p className={styles.sub}>
                    Wear the sky. Small-batch KumoLab apparel, dropped in
                    limited runs.
                </p>
            </header>

            <section className={styles.shop}>
                <div className={styles.inner}>
                    {products.length > 0 ? (
                        <>
                            <div className={styles.grid}>
                                {products.map((product) => {
                                    // Anchor is cosmetic only — show it struck-through beside the
                                    // live (charged) price when it's genuinely higher.
                                    const hasAnchor =
                                        product.anchorPrice != null &&
                                        product.anchorPrice > product.price;
                                    const pct = hasAnchor
                                        ? Math.round(
                                              (1 - product.price / (product.anchorPrice as number)) * 100
                                          )
                                        : 0;
                                    return (
                                        <Link
                                            href={`/merch/${product.id}`}
                                            key={product.id}
                                            className={styles.card}
                                        >
                                            <div className={styles.media}>
                                                <SkyMerchImage
                                                    src={upgradePrintfulImage(product.image)}
                                                    fallbackSrc={product.image || ''}
                                                    alt={product.name}
                                                />
                                                <div className={styles.mediaVeil} aria-hidden="true" />
                                                <span className={styles.ribbon}>限定 LIMITED</span>
                                                {hasAnchor && (
                                                    <span className={styles.saleBadge}>
                                                        {product.label ? `${product.label} · ` : ''}-{pct}%
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.body}>
                                                <h2 className={styles.name}>{product.name}</h2>
                                                <p className={styles.priceRow}>
                                                    {hasAnchor && (
                                                        <span className={styles.anchor}>
                                                            ${(product.anchorPrice as number).toFixed(2)}
                                                        </span>
                                                    )}
                                                    <span className={styles.price}>
                                                        ${product.price.toFixed(2)}
                                                    </span>
                                                </p>
                                                <span className={styles.cta}>
                                                    Shop this drop
                                                    <span className={styles.ctaArrow} aria-hidden="true">
                                                        →
                                                    </span>
                                                </span>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                            <p className={styles.note}>
                                小ロット生産. Pressed in small batches. When a run
                                sells out, it returns to the clouds.
                            </p>
                        </>
                    ) : (
                        <div className={styles.empty}>
                            <span className={styles.emptyGlyph} aria-hidden="true">
                                雲
                            </span>
                            <p>
                                The shelves are up in the clouds right now. The next
                                drop lands soon.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            <SkyFooter />
        </SkyContentRoot>
    );
}
