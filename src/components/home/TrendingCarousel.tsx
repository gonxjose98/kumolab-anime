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
    const containerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);

    // Animation State
    const xRef = useRef(0);
    const rafIdRef = useRef<number>(0);

    // Drag State
    const [isDown, setIsDown] = useState(false);
    const startXRef = useRef(0);
    const startTranslateRef = useRef(0);

    // Initial Mount
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        // eslint-disable-next-line
        setMounted(true);
        setMinutesAgo(Math.floor(Math.random() * 59) + 1);
    }, []);

    // Animation Loop
    useEffect(() => {
        const animate = () => {
            if (!isPaused && !isDown && trackRef.current) {
                xRef.current += 1.0;

                const totalWidth = trackRef.current.scrollWidth;
                // Since content is repeated 8 times, resetting at half width is safe
                // but checking full scrollWidth vs infinite loop logic:
                // We want to reset when we've scrolled past 1 full set of items.
                // If items are 8x, we can reset after 1/8th or 1/2.
                // To be safe and identical to previous logic: Reset at Half.
                const halfWidth = totalWidth / 2;

                if (xRef.current >= halfWidth) {
                    xRef.current = 0;
                }

                trackRef.current.style.transform = `translateX(-${xRef.current}px)`;
            }
            rafIdRef.current = requestAnimationFrame(animate);
        };

        rafIdRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafIdRef.current);
    }, [isPaused, isDown]);

    // Global Drag Handlers
    useEffect(() => {
        if (!isDown) return;

        const handleGlobalMove = (e: MouseEvent) => {
            if (!trackRef.current) return;
            e.preventDefault();
            const currentX = e.pageX;
            const walk = (currentX - startXRef.current);
            xRef.current = startTranslateRef.current - walk;
            trackRef.current.style.transform = `translateX(-${xRef.current}px)`;
        };

        const handleGlobalUp = () => {
            setIsDown(false);
            setIsPaused(false);
        };

        document.addEventListener('mousemove', handleGlobalMove);
        document.addEventListener('mouseup', handleGlobalUp);

        return () => {
            document.removeEventListener('mousemove', handleGlobalMove);
            document.removeEventListener('mouseup', handleGlobalUp);
        };
    }, [isDown]);

    // Event Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!window.matchMedia('(hover: hover)').matches) return;
        setIsDown(true);
        setIsPaused(true);
        startXRef.current = e.pageX;
        startTranslateRef.current = xRef.current;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDown(true);
        setIsPaused(true);
        startXRef.current = e.touches[0].pageX;
        startTranslateRef.current = xRef.current;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDown || !trackRef.current) return;
        const currentX = e.touches[0].pageX;
        const walk = (currentX - startXRef.current);
        xRef.current = startTranslateRef.current - walk;
        trackRef.current.style.transform = `translateX(-${xRef.current}px)`;
    };

    const handleInteractionEnd = () => {
        setIsDown(false);
        setIsPaused(false);
    };

    const handlePointerEnter = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') setIsPaused(true);
    };

    const handlePointerLeave = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') setIsPaused(false);
    };

    // Octuple content
    const carouselItems = [...posts, ...posts, ...posts, ...posts, ...posts, ...posts, ...posts, ...posts];

    return (
        <section className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Currently Trending</h2>
                <span className={styles.badge}>UPDATED {minutesAgo} MINUTES AGO</span>
            </div>

            <div
                className={styles.carouselContainer}
                ref={containerRef}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleInteractionEnd}
                onTouchCancel={handleInteractionEnd}
                style={{ cursor: isDown ? 'grabbing' : 'grab', overflow: 'hidden' }}
            >
                <div className={styles.track} ref={trackRef}>
                    {carouselItems.map((post, index) => (
                        <Link href={`/blog/${post.slug}`} key={`${post.id}-${index}`} className={styles.card}>
                            <div className={styles.imageWrapper}>
                                {post.image ? (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={post.image} alt={post.title} className={styles.image} />
                                    </>
                                ) : (
                                    <div className={styles.placeholderImage} />
                                )}
                                <span className={styles.typeBadge}>{post.type}</span>
                            </div>
                            <div className={styles.content}>
                                <span className={styles.timestamp}>
                                    {mounted ? new Date(post.timestamp).toLocaleDateString() : ''}
                                </span>
                                <h3 className={styles.cardTitle}>
                                    {post.title.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '')}
                                </h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default TrendingCarousel;
