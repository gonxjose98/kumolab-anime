import Link from 'next/link';
import { getVisibleProducts } from '@/lib/merch';
import { Product } from '@/types';
import PageShell from '../PageShell';
import p from '../Pages.module.css';

/** Printful thumbs are low-res; the same asset is served larger as `_preview`. */
function upgrade(url: string): string {
    try {
        if (!new URL(url).hostname.endsWith('printful.com')) return url;
        return url.replace(/_thumb(\.(?:png|jpe?g|webp|gif))(\?.*)?$/i, '_preview$1$2');
    } catch { return url; }
}

export default async function ShopPage() {
    let products: Product[] = [];
    try { products = await getVisibleProducts(); } catch (e) { console.error('[shop] products', e); }
    return (
        <PageShell title="The Cloud Collection" sub="Small-batch KumoLab apparel, made in limited runs." active="/merch">
            <div className={p.wrap}>
                {products.length === 0 ? (
                    <p className={p.empty}>The shelves are empty right now. The next drop lands soon.</p>
                ) : (
                    <>
                        <div className={p.grid4} style={products.length < 4 ? { gridTemplateColumns: `repeat(${products.length}, minmax(0, 1fr))` } : undefined}>
                            {products.map((m, i) => {
                                const anchor = m.anchorPrice != null && m.anchorPrice > m.price ? m.anchorPrice : null;
                                return (
                                    <Link key={m.id} href={`/merch/${m.id}`} className={p.shopCard} data-reveal data-reveal-i={i % 4}>
                                        <div className={p.shopStage}>
                                            {(m.label || m.isFeatured) && <span className={p.shopBadge}>{m.label || 'The flagship'}</span>}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={upgrade(m.image)} alt={m.name} loading="lazy" className={p.shopImg} />
                                        </div>
                                        <div className={p.shopInfo}>
                                            <div>
                                                <h3 className={p.shopName}>{m.name}</h3>
                                                <span className={p.shopView}>View details →</span>
                                            </div>
                                            <span className={p.shopPrice}>{anchor && <span className={p.anchor}>${anchor.toFixed(2)}</span>}${m.price.toFixed(2)}</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                        <p className={p.shopNote}>Made in small batches. When a run sells out, it&apos;s gone.</p>
                    </>
                )}
            </div>
        </PageShell>
    );
}
