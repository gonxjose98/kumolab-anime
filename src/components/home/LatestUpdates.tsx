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

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Animation Loop
    useEffect(() => {
        const animate = () => {
            if (!isPaused && !isDown && trackRef.current) {
                xRef.current += 1.0;

                const totalWidth = trackRef.current.scrollWidth;
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
    const carouselItems = [...updates, ...updates, ...updates, ...updates, ...updates, ...updates, ...updates, ...updates];

    return (
        <section className={styles.section}>
            <div className={`container ${styles.header}`}>
                <h2 className={styles.title}>Latest Updates</h2>
                <p className={styles.subtitle}>Stay current with what’s happening right now.</p>
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

export default LatestUpdates;
