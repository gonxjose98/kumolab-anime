'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import Link from 'next/link';
import { BlogPost, Product } from '@/types';
import { trackEvent } from '@/lib/analytics/events';
import styles from './ArticleCTA.module.css';

type Status = 'idle' | 'loading' | 'done' | 'error';

function postImage(post: BlogPost): string | undefined {
    if (post.youtube_video_id) {
        return `https://img.youtube.com/vi/${post.youtube_video_id}/hqdefault.jpg`;
    }
    return post.image;
}

function cleanTitle(title: string): string {
    return title.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
}

/**
 * Reveals a block the first time it scrolls into view. Toggles a CSS class so
 * the block fades in, then a gentle CSS nudge draws the eye. Fires once and
 * disconnects; falls back to visible if IntersectionObserver is unavailable.
 */
function useReveal<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === 'undefined') {
            setShown(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShown(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.2 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return { ref, shown };
}

/**
 * End-of-article capture band (Q1). The blog article page is where ~100% of
 * social clickthrough lands, and until now it captured nothing. This turns a
 * one-and-done reader into an owned relationship: join the newsletter, keep
 * reading related drops, or discover the store — the three things that feed the
 * ecosystem loop. Every interaction is tracked (Q4) so the funnel is visible.
 */
export default function ArticleCTA({
    related,
    product,
}: {
    related: BlogPost[];
    product: Product | null;
}) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const relatedReveal = useReveal<HTMLDivElement>();
    const merchReveal = useReveal<HTMLAnchorElement>();

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!email || status === 'loading') return;
        setStatus('loading');
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            setStatus(res.ok ? 'done' : 'error');
            if (res.ok) trackEvent('email_signup', { meta: { source: 'article_cta' } });
        } catch {
            setStatus('error');
        }
    };

    return (
        <section className={styles.section} aria-label="Stay in the loop">
            {/* Newsletter capture */}
            <div className={styles.card}>
                <div className={styles.kicker}>天気予報 · The Forecast</div>
                <h2 className={styles.title}>Never miss a drop.</h2>
                <p className={styles.sub}>
                    One calm email a week. Every confirmed release, date, and trailer, verified
                    before it reaches you. No spoilers, no spam.
                </p>

                {status === 'done' ? (
                    <div className={styles.success}>
                        <span className={styles.successKanji}>晴</span>
                        You&apos;re on the list. Clear skies ahead.
                    </div>
                ) : (
                    <form className={styles.form} onSubmit={submit}>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className={styles.input}
                            aria-label="Email address"
                        />
                        <button type="submit" className={styles.button} disabled={status === 'loading'}>
                            {status === 'loading' ? 'Joining…' : 'Join The Forecast'}
                        </button>
                    </form>
                )}
                {status === 'error' && (
                    <p className={styles.error}>The sky hiccuped. Please try again in a moment.</p>
                )}
            </div>

            {/* Related drops */}
            {related.length > 0 && (
                <div
                    ref={relatedReveal.ref}
                    className={`${styles.relatedWrap} ${styles.reveal} ${relatedReveal.shown ? styles.revealIn : ''}`}
                >
                    <h3 className={styles.relatedHead}>Keep reading</h3>
                    <div className={styles.relatedGrid}>
                        {related.map((post) => {
                            const img = postImage(post);
                            return (
                                <Link
                                    key={post.id || post.slug}
                                    href={`/blog/${post.slug}`}
                                    className={styles.relatedCard}
                                    onClick={() => trackEvent('related_click', { meta: { slug: post.slug } })}
                                >
                                    <div className={styles.relatedMedia}>
                                        {img ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={img} alt="" loading="lazy" className={styles.relatedImg} />
                                        ) : (
                                            <div className={styles.relatedFallback}>雲</div>
                                        )}
                                    </div>
                                    <span className={styles.relatedTitle}>{cleanTitle(post.title)}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Merch teaser */}
            {product && (
                <Link
                    href="/merch"
                    ref={merchReveal.ref}
                    className={`${styles.merch} ${styles.reveal} ${styles.revealLate} ${merchReveal.shown ? styles.revealIn : ''}`}
                    onClick={() => trackEvent('merch_click', { meta: { from: 'article_cta', productId: product.id } })}
                >
                    <div className={styles.merchMedia}>
                        {product.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image} alt={product.name} className={styles.merchImg} />
                        ) : (
                            <div className={styles.relatedFallback}>雲</div>
                        )}
                    </div>
                    <div className={styles.merchBody}>
                        <div className={styles.merchKicker}>Wear the cloud</div>
                        <div className={styles.merchName}>{product.name}</div>
                        <span className={styles.merchCta}>Shop the collection →</span>
                    </div>
                </Link>
            )}
        </section>
    );
}
