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
    const accumulatorRef = useRef(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let animId: number;

        const scroll = () => {
            if (!isPaused && !isDown) {
                if (el.scrollLeft >= (el.scrollWidth / 2) - 1) {
                    el.scrollLeft = 0;
                    accumulatorRef.current = 0;
                } else {
                    // Accumulate fractional pixels
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
            const walk = (x - startX); // 1:1 movement
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

    // Octuple content
    const carouselItems = [...updates, ...updates, ...updates, ...updates, ...updates, ...updates, ...updates, ...updates];

    return (
        <section className={styles.section}>
            <div className={`container ${styles.header}`}>
                <h2 className={styles.title}>Latest Updates</h2>
                <p className={styles.subtitle}>Stay current with what’s happening right now.</p>
            </div>

            <div
                className={styles.carouselContainer}
                ref={scrollRef}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                onMouseDown={handleMouseDown}
                onTouchStart={() => setIsPaused(true)}
                onTouchEnd={() => setIsPaused(false)}
                onTouchCancel={() => setIsPaused(false)}
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
                                        {mounted ? new Date(post.timestamp).toLocaleDateString() : ''}
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
