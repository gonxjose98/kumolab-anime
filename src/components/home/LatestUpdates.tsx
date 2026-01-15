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
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeftStart, setScrollLeftStart] = useState(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let animId: number;

        const scroll = () => {
            if (!isPaused && !isDown) {
                if (el.scrollLeft >= el.scrollWidth / 2) {
                    el.scrollLeft = 0;
                } else {
                    el.scrollLeft += 0.8;
                }
            }
            animId = requestAnimationFrame(scroll);
        };

        animId = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(animId);
    }, [isPaused, isDown]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const el = scrollRef.current;
        if (!el) return;
        setIsDown(true);
        setIsPaused(true);
        setStartX(e.pageX - el.offsetLeft);
        setScrollLeftStart(el.scrollLeft);
    };

    const handleMouseLeave = () => {
        setIsDown(false);
        setIsPaused(false);
    };

    const handleMouseUp = () => {
        setIsDown(false);
        setIsPaused(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDown || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = (x - startX) * 2;
        scrollRef.current.scrollLeft = scrollLeftStart - walk;
    };

    // Quadruple content
    const carouselItems = [...updates, ...updates, ...updates, ...updates];

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
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={() => setIsPaused(true)}
                onTouchEnd={() => setIsPaused(false)}
                style={{ cursor: isDown ? 'grabbing' : 'grab' }}
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
