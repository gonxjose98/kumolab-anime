'use client';

import Link from 'next/link';
import { useRef, useEffect } from 'react';
import { BlogPost } from '@/types';
import styles from './LatestUpdates.module.css';

interface LatestUpdatesProps {
    posts: BlogPost[];
}

const LatestUpdates = ({ posts }: LatestUpdatesProps) => {
    const updates = posts.filter(p => p.type !== 'DROP');
    const scrollerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;

        // Clone the content to ensure seamless scrolling
        // If we don't have enough content to scroll, do nothing
        if (scroller.scrollWidth <= scroller.clientWidth) return;

        // Use a CSS-based animation class if possible, or simple JS loop
    }, []);

    return (
        <section className={styles.section}>
            <div className={`container ${styles.header}`}>
                <h2 className={styles.title}>Latest Updates</h2>
                <p className={styles.subtitle}>Stay current with what’s happening right now.</p>
            </div>

            <div className={styles.carouselContainer}>
                {/* 
                   Double the content for seamless infinite loop using CSS animation.
                   We need a wrapper track that moves.
                */}
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
