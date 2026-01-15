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

    // Drag State
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeftStart, setScrollLeftStart] = useState(0);
    const accumulatorRef = useRef(0);

    useEffect(() => {
        setMinutesAgo(Math.floor(Math.random() * 59) + 1);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let animId: number;

        const scroll = () => {
            if (!isPaused && !isDown) {
                // Infinite Loop Check (Reset)
                // Use tolerance of 1px
                if (el.scrollLeft >= (el.scrollWidth / 2) - 1) {
                    el.scrollLeft = 0;
                    accumulatorRef.current = 0;
                } else {
                    // Accumulate fractional scroll amounts to handle integer-pixel browsers
                    accumulatorRef.current += 0.8;
                    const wholePixels = Math.floor(accumulatorRef.current);

                    if (wholePixels >= 1) {
                        el.scrollLeft += wholePixels;
                        accumulatorRef.current -= wholePixels;
                    }
                }
            }
            animId = requestAnimationFrame(scroll);
        };

        animId = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(animId);
    }, [isPaused, isDown]);

    // Global Drag Handlers
    useEffect(() => {
        if (!isDown) return;

        const handleGlobalMove = (e: MouseEvent) => {
            if (!scrollRef.current) return;
            e.preventDefault();
            const x = e.pageX - scrollRef.current.offsetLeft;
            const walk = (x - startX); // 1:1 movement (removed * 2)
            scrollRef.current.scrollLeft = scrollLeftStart - walk;
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
    }, [isDown, startX, scrollLeftStart]);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Disable drag logic on touch devices
        if (!window.matchMedia('(hover: hover)').matches) return;

        if (!scrollRef.current) return;
        setIsDown(true);
        setIsPaused(true);
        setStartX(e.pageX - scrollRef.current.offsetLeft);
        setScrollLeftStart(scrollRef.current.scrollLeft);
    };

    const handlePointerEnter = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') {
            setIsPaused(true);
        }
    };

    const handlePointerLeave = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') {
            setIsPaused(false);
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!scrollRef.current) return;
        setIsDown(true);
        setIsPaused(true);
        setStartX(e.touches[0].pageX - scrollRef.current.offsetLeft);
        setScrollLeftStart(scrollRef.current.scrollLeft);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDown || !scrollRef.current) return;
        const x = e.touches[0].pageX - scrollRef.current.offsetLeft;
        const walk = (x - startX);
        scrollRef.current.scrollLeft = scrollLeftStart - walk;
    };

    const handleTouchEnd = () => {
        setIsDown(false);
        setIsPaused(false);
    };

    // Octuple content to guarantee seamless loop on all viewports
    const carouselItems = [...posts, ...posts, ...posts, ...posts, ...posts, ...posts, ...posts, ...posts];

    return (
        <section className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Currently Trending</h2>
                <span className={styles.badge}>UPDATED {minutesAgo} MINUTES AGO</span>
            </div>

            <div
                className={styles.carouselContainer}
                ref={scrollRef}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
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
