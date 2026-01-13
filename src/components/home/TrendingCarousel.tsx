'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BlogPost } from '@/types';
import styles from './TrendingCarousel.module.css';

interface TrendingCarouselProps {
    posts: BlogPost[];
}

const TrendingCarousel = ({ posts }: TrendingCarouselProps) => {
    const [minutesAgo, setMinutesAgo] = useState(0);

    useEffect(() => {
        setMinutesAgo(Math.floor(Math.random() * 59) + 1);
    }, []);

    const carouselItems = [...posts, ...posts];

    return (
        <section className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Currently Trending</h2>
                <span className={styles.badge}>UPDATED {minutesAgo} MINUTES AGO</span>
            </div>

            <div className={styles.carouselContainer}>
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
