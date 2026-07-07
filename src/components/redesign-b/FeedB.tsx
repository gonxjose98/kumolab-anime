'use client';

import Link from 'next/link';
import type { BlogPost } from '@/types';
import styles from './FeedB.module.css';
import { useReveal } from './useReveal';

interface FeedBProps {
    posts: BlogPost[];
}

const TAG_COLORS: Record<string, string> = {
    DROP: '#8fe8ff',
    INTEL: '#a08cff',
    TRENDING: '#ffb35c',
    COMMUNITY: '#8fe8ff',
    CONFIRMATION_ALERT: '#ff7ac8',
};

const DEFAULT_TAG_COLOR = '#8fe8ff';

function getRelativeTime(timestamp: string): string {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

const FeedB = ({ posts }: FeedBProps) => {
    const { ref, visible } = useReveal<HTMLElement>(0.06);

    // Published only, dedupe by title prefix (mirrors live-feed behavior)
    const seen = new Set<string>();
    const feed = posts
        .filter(p => p.isPublished)
        .filter(p => {
            const key = p.title.substring(0, 30).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);

    if (feed.length === 0) return null;

    return (
        <section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
            <div className={styles.header}>
                <div className={styles.eyebrow}>最新ドロップ · LIVE FEED</div>
                <div className={styles.headerRow}>
                    <h2 className={styles.title}>Fresh from the Lab</h2>
                    <Link href="/blog" className={styles.viewAll}>
                        All drops →
                    </Link>
                </div>
            </div>

            <div className={styles.grid}>
                {feed.map((post, i) => {
                    const tagColor = TAG_COLORS[post.type] || DEFAULT_TAG_COLOR;
                    const cleanTitle = post.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '');
                    const image = post.image || post.background_image;

                    return (
                        <Link
                            key={post.id || post.slug}
                            href={`/blog/${post.slug}`}
                            className={`${styles.card} ${i === 0 ? styles.cardFeature : ''}`}
                            style={{ '--d': `${i * 0.1}s`, '--tag': tagColor } as React.CSSProperties}
                        >
                            <div className={styles.media}>
                                {image ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={image}
                                        alt=""
                                        loading="lazy"
                                        className={styles.mediaImg}
                                    />
                                ) : (
                                    <div className={styles.mediaFallback}>
                                        <span className={styles.mediaKanji}>雲</span>
                                    </div>
                                )}
                                <div className={styles.mediaVeil} />
                                <span className={styles.tag}>
                                    <span className={styles.tagDot} />
                                    {post.type.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className={styles.body}>
                                <div className={styles.meta}>
                                    {post.source && <span className={styles.source}>{post.source}</span>}
                                    <span className={styles.time}>{getRelativeTime(post.timestamp)}</span>
                                </div>
                                <h3 className={styles.cardTitle}>{cleanTitle}</h3>
                                <span className={styles.readMore}>Read the drop →</span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
};

export default FeedB;
