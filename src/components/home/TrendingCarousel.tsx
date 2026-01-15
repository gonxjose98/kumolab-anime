'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { BlogPost } from '@/types';
import styles from './TrendingCarousel.module.css';

interface TrendingCarouselProps {
    posts: BlogPost[];
}

const TrendingCarousel = ({ posts }: TrendingCarouselProps) => {
    const [minutesAgo, setMinutesAgo] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        setMinutesAgo(Math.floor(Math.random() * 59) + 1);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let animId: number;

        const scroll = () => {
            if (!isPaused) {
                // If we've scrolled past the first set of items (halfway), snap back to start
                // We use >= here, and since the content is duplicated, 
                // the visuals at scrollLeft=0 and scrollLeft=halfWidth should be identical.
                if (el.scrollLeft >= el.scrollWidth / 2) {
                    el.scrollLeft = 0;
                } else {
                    el.scrollLeft += 0.8; // Speed (approx matches 40s/120s visually)
                }
            }
            animId = requestAnimationFrame(scroll);
        };

        animId = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(animId);
    }, [isPaused]);

    const carouselItems = [...posts, ...posts];

    return (
        <section className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Currently Trending</h2>
                <span className={styles.badge}>UPDATED {minutesAgo} MINUTES AGO</span>
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
                    {carouselItems.map((post, index) => (
                        <Link href={`/blog/${post.slug}`} key={`${post.id}-${index}`} className={styles.card}>
                            <div className={styles.imageWrapper}>
                                {post.image ? (
                                    <img src={post.image} alt={post.title} className={styles.image} />
                                ) : (
                                    <div className={styles.placeholderImage} />
                                )}
                                <span className={styles.typeBadge}>{post.type}</span>
                            </div>
                            <div className={styles.content}>
                                <span className={styles.timestamp}>
                                    {new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <h3 className={styles.cardTitle}>{post.title}</h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default TrendingCarousel;
