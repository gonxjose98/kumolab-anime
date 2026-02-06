
'use client';

import styles from './MostRecentFeed.module.css';
import { BlogPost } from '@/types';
import Link from 'next/link';

interface MostRecentFeedProps {
    posts: BlogPost[];
}

const MostRecentFeed = ({ posts }: MostRecentFeedProps) => {
    // Filter out: Daily Drops (DROP) and HIDDEN posts. Keep COMMUNITY/INTEL.
    let filteredPosts = posts.filter(p => p.type !== 'DROP' && p.isPublished);

    // Deduplicate by Title (Simple heuristic: first 30 chars)
    const seenTitles = new Set();
    filteredPosts = filteredPosts.filter(post => {
        const titleKey = post.title.substring(0, 30).toLowerCase();
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
    });

    if (filteredPosts.length === 0) return null;

    return (
        <section className={styles.section}>
            <div className="container">
                <h2 className={styles.sectionTitle}>MOST RECENT</h2>

                <div className={styles.feed}>
                    {filteredPosts.map((post) => (
                        <Link href={`/blog/${post.slug}`} key={post.id} className={styles.card}>
                            <div className={styles.imageWrapper}>
                                {post.image ? (
                                    <div className={styles.imageAspectRatio}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={post.image}
                                            alt={post.title}
                                            className={styles.image}
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '/hero-bg-final.png';
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className={styles.placeholder} />
                                )}
                                <span className={styles.badge}>{post.type}</span>
                            </div>

                            <div className={styles.content}>
                                <div className={styles.meta}>
                                    <time className={styles.date}>
                                        {new Date(post.timestamp).toLocaleDateString(undefined, {
                                            month: 'long', day: 'numeric', year: 'numeric'
                                        })}
                                    </time>
                                </div>
                                <h3 className={styles.title}>
                                    {post.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '')}
                                </h3>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default MostRecentFeed;
