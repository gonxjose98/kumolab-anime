'use client';

import Link from 'next/link';
import { BlogPost } from '@/types';
import { Reveal } from './motion';
import styles from './DriftFeed.module.css';

interface DriftFeedProps {
    posts: BlogPost[];
}

/* Dawn-palette tag colors */
const TAG_COLORS: Record<string, string> = {
    DROP: '#ffd9a4',
    INTEL: '#cbb2e8',
    TRENDING: '#f5a96e',
    COMMUNITY: '#ffc890',
    CONFIRMATION_ALERT: '#f08a8a',
};

const DEFAULT_TAG_COLOR = '#ffd9a4';

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

function getImage(post: BlogPost): string | undefined {
    if (post.youtube_video_id) {
        return `https://img.youtube.com/vi/${post.youtube_video_id}/hqdefault.jpg`;
    }
    return post.image;
}

const DriftFeed = ({ posts }: DriftFeedProps) => {
    // Published only; dedupe near-identical titles (mirrors live feed logic).
    const seen = new Set<string>();
    const items = posts
        .filter((p) => p.isPublished)
        .filter((p) => {
            const key = p.title.substring(0, 30).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);

    if (items.length === 0) return null;

    return (
        <section className={styles.section}>
            <div className={styles.inner}>
                <div className={styles.header}>
                    <Reveal>
                        <div className={styles.kicker}>最新 · Fresh From the Feed</div>
                    </Reveal>
                    <Reveal delay={0.08}>
                        <h2 className={styles.title}>Latest Drops</h2>
                    </Reveal>
                    <Reveal delay={0.16}>
                        <p className={styles.sub}>
                            Every announcement, verified before it reaches you. No rumors, no noise.
                        </p>
                    </Reveal>
                </div>

                <div className={styles.grid}>
                    {items.map((post, i) => {
                        const color = TAG_COLORS[post.type] || DEFAULT_TAG_COLOR;
                        const img = getImage(post);
                        const cleanTitle = post.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '');
                        return (
                            <Reveal key={post.id || post.slug} delay={(i % 3) * 0.1} className={styles.cell}>
                                <Link href={`/blog/${post.slug}`} className={styles.card}>
                                    <div className={styles.media}>
                                        {img ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={img}
                                                alt=""
                                                loading="lazy"
                                                className={styles.image}
                                            />
                                        ) : (
                                            <div className={styles.fallback}>雲</div>
                                        )}
                                        <div className={styles.mediaVeil} />
                                        <span
                                            className={styles.tag}
                                            style={{ '--tag': color } as React.CSSProperties}
                                        >
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
                            </Reveal>
                        );
                    })}
                </div>

                <Reveal delay={0.15}>
                    <div className={styles.footerRow}>
                        <Link href="/blog" className={styles.feedCta}>
                            Explore the full feed →
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};

export default DriftFeed;
