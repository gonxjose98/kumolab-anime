'use client';

import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import { BlogPost } from '@/types';
import styles from './LatestUpdates.module.css';

interface LatestUpdatesProps {
    posts: BlogPost[];
}

const LatestUpdates = ({ posts }: LatestUpdatesProps) => {
    const updates = posts.filter(p => p.type !== 'DROP');
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let animId: number;

        const scroll = () => {
            if (!isPaused) {
                if (el.scrollLeft >= el.scrollWidth / 2) {
                    el.scrollLeft = 0;
                } else {
                    el.scrollLeft += 0.8; // Matched speed
                }
            }
            animId = requestAnimationFrame(scroll);
        };

        animId = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(animId);
    }, [isPaused]);

    return (
        <section className={styles.section}>
            <div className={`container ${styles.header}`}>
                <h2 className={styles.title}>Latest Updates</h2>
                <p className={styles.subtitle}>Stay current with what’s happening right now.</p>
            </div>

            <div
                className={styles.carouselContainer}
                ref={scrollRef}
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                onTouchStart={() => setIsPaused(true)}
                onTouchEnd={() => setIsPaused(false)}
            >
                <div className={styles.track}>
                    {/* First set */}
                    {updates.map((post) => (
                        <Link href={`/blog/${post.slug}`} key={`a-${post.id}`} className={styles.card}>
                            <div className={styles.imageWrapper}>
                                {post.image ? (
                                    <img src={post.image} alt={post.title} className={styles.image} />
                                ) : (
                                    <div className={styles.placeholderImage} />
                                )}
                                <span className={styles.typeBadge}>{post.type}</span>
                            </div>

                            <div className={styles.content}>
                                <div className={styles.meta}>
                                    <span className={styles.time}>
                                        {new Date(post.timestamp).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 className={styles.cardTitle}>{post.title}</h3>
                            </div>
                        </Link>
                    ))}

                    {/* Second set (cloned) */}
                    {updates.map((post) => (
                        <Link href={`/blog/${post.slug}`} key={`b-${post.id}`} className={styles.card}>
                            <div className={styles.imageWrapper}>
                                {post.image ? (
                                    <img src={post.image} alt={post.title} className={styles.image} />
                                ) : (
                                    <div className={styles.placeholderImage} />
                                )}
                                <span className={styles.typeBadge}>{post.type}</span>
                            </div>

                            <div className={styles.content}>
                                <div className={styles.meta}>
                                    <span className={styles.time}>
                                        {new Date(post.timestamp).toLocaleDateString()}
                                    </span>
                                </div>
                                <h3 className={styles.cardTitle}>{post.title}</h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default LatestUpdates;
