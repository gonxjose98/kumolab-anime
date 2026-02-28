'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './MostRecentFeed.module.css';
import { BlogPost } from '@/types';
import Link from 'next/link';

interface MostRecentFeedProps {
    posts: BlogPost[];
}

const TAG_COLORS: Record<string, string> = {
    DROP: '#00d4ff',
    INTEL: '#7b61ff',
    TRENDING: '#ff6b35',
    COMMUNITY: '#00d4ff',
    CONFIRMATION_ALERT: '#ff3cac',
    TRAILER: '#ff3cac',
    TEASER: '#7b61ff',
};

function getRelativeTime(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

const MostRecentFeed = ({ posts }: MostRecentFeedProps) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter: keep published, non-DROP posts. Deduplicate by title prefix.
    let filteredPosts = posts.filter(p => p.type !== 'DROP' && p.isPublished);
    const seenTitles = new Set<string>();
    filteredPosts = filteredPosts.filter(post => {
        const titleKey = post.title.substring(0, 30).toLowerCase();
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
    });

    // Track which card is in view for the scroll indicator
    useEffect(() => {
        const c = containerRef.current;
        if (!c) return;
        const handler = () => {
            const cards = c.querySelectorAll('[data-fc]');
            let closest = 0;
            let minDist = Infinity;
            cards.forEach((card, i) => {
                const d = Math.abs(
                    card.getBoundingClientRect().top - c.getBoundingClientRect().top
                );
                if (d < minDist) {
                    minDist = d;
                    closest = i;
                }
            });
            setActiveIndex(closest);
        };
        c.addEventListener('scroll', handler, { passive: true });
        return () => c.removeEventListener('scroll', handler);
    }, []);

    if (filteredPosts.length === 0) return null;

    // Limit to top 20 for the feed
    const feedPosts = filteredPosts.slice(0, 20);

    return (
        <section className={styles.section}>
            {/* Section Header */}
            <div className={styles.header}>
                <div className={styles.headerTag}>◉ 最新 — Most Recent</div>
                <div className={styles.headerRow}>
                    <h2 className={styles.headerTitle}>Most Recent</h2>
                    <span className={styles.headerHint}>Swipe to discover</span>
                </div>
            </div>

            {/* TikTok-style scroll container */}
            <div ref={containerRef} className={styles.feedContainer}>
                {feedPosts.map((post, i) => {
                    const tagColor = TAG_COLORS[post.type] || '#00d4ff';
                    const cleanTitle = post.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '');

                    return (
                        <Link
                            href={`/blog/${post.slug}`}
                            key={post.id}
                            data-fc=""
                            className={styles.card}
                        >
                            {/* Background image */}
                            {post.image && (
                                <img
                                    src={post.image}
                                    alt=""
                                    loading="lazy"
                                    className={styles.cardImage}
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        if (!target.src.endsWith('/hero-bg-final.png')) {
                                            target.src = '/hero-bg-final.png';
                                        }
                                    }}
                                />
                            )}
                            <div className={styles.cardGradient} />
                            <div className={styles.cardScanlines} />

                            {/* Tag */}
                            <div
                                className={styles.cardTag}
                                style={{
                                    '--tag-color': tagColor,
                                } as React.CSSProperties}
                            >
                                <span className={styles.tagDot} />
                                <span className={styles.tagText}>{post.type}</span>
                            </div>

                            {/* Counter */}
                            <div className={styles.cardCounter}>
                                {String(i + 1).padStart(2, '0')}/{String(feedPosts.length).padStart(2, '0')}
                            </div>

                            {/* Bottom content */}
                            <div className={styles.cardBottom}>
                                <div className={styles.cardMeta}>
                                    {post.source && (
                                        <span className={styles.cardSource}>{post.source}</span>
                                    )}
                                    <span className={styles.cardTime}>{getRelativeTime(post.timestamp)}</span>
                                </div>
                                <h3 className={styles.cardTitle}>{cleanTitle}</h3>
                            </div>

                            {/* Corner accents */}
                            <span className={styles.cornerTL} style={{ borderColor: `${tagColor}40` } as React.CSSProperties} />
                            <span className={styles.cornerTR} style={{ borderColor: `${tagColor}40` } as React.CSSProperties} />
                            <span className={styles.cornerBL} style={{ borderColor: `${tagColor}40` } as React.CSSProperties} />
                            <span className={styles.cornerBR} style={{ borderColor: `${tagColor}40` } as React.CSSProperties} />
                        </Link>
                    );
                })}
            </div>

            {/* Scroll progress dots */}
            <div className={styles.scrollDots}>
                {feedPosts.slice(0, 10).map((_, i) => (
                    <div
                        key={i}
                        className={`${styles.dot} ${activeIndex === i ? styles.dotActive : ''}`}
                    />
                ))}
            </div>
        </section>
    );
};

export default MostRecentFeed;
