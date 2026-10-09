import Link from 'next/link';
import { BlogPost, Product } from '@/types';
import p from './Pages.module.css';

const img = (post: BlogPost) => (post.youtube_video_id ? `https://img.youtube.com/vi/${post.youtube_video_id}/hqdefault.jpg` : post.image);
const clean = (t: string) => t.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

/** Article sidebar: more drops, the Forecast signup, and one merch teaser. */
export default function ArticleSide({ related, product }: { related: BlogPost[]; product: Product | null }) {
    return (
        <aside className={p.side}>
            {related.length > 0 && (
                <div className={p.sideCard}>
                    <h2 className={p.sideTitle}>More drops</h2>
                    {related.map((r) => (
                        <Link key={r.slug} href={`/blog/${r.slug}`} className={p.mini}>
                            {img(r) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={img(r)} alt="" loading="lazy" className={p.miniImg} />
                            )}
                            <span className={p.miniTitle}>{clean(r.title)}</span>
                        </Link>
                    ))}
                </div>
            )}
            <div className={p.sideCard}>
                <h2 className={p.sideTitle}>Get the Forecast</h2>
                <p className={p.sideText}>The week&apos;s best trailers, releases and stories, every Sunday. No spoilers, no spam.</p>
                <Link href="/#forecast" className={p.ctaBtn}>Join for free</Link>
            </div>
            {product && (
                <div className={p.sideCard}>
                    <h2 className={p.sideTitle}>From the shop</h2>
                    <Link href={`/merch/${product.id}`} className={p.teaser}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={product.image} alt={product.name} loading="lazy" className={p.teaserImg} />
                        <span>
                            <span className={p.teaserName}>{product.name}</span><br />
                            <span className={p.teaserPrice}>${product.price.toFixed(2)}</span>
                        </span>
                    </Link>
                </div>
            )}
        </aside>
    );
}
