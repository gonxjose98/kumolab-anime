'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BlogPost, PostType } from '@/types';
import styles from './SkyBlog.module.css';

interface SkyBlogFeedProps {
    posts: BlogPost[];
}

const PAGE_SIZE = 9;

const FILTERS = ['ALL', 'DROP', 'INTEL', 'TRENDING', 'COMMUNITY'] as const;
type Filter = (typeof FILTERS)[number];

/* Bright-sky tag colors (mirrors the landing preview's feed) */
const TAG_COLORS: Record<string, string> = {
    DROP: '#ffe08a',
    INTEL: '#bfe0ff',
    TRENDING: '#ffbd85',
    COMMUNITY: '#a9f0d2',
    CONFIRMATION_ALERT: '#ffb3b3',
};

const DEFAULT_TAG_COLOR = '#ffe08a';

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

/** Clean plain-text excerpt from the post's excerpt or markdown body. */
function getExcerpt(post: BlogPost): string {
    const raw = post.excerpt || post.content || '';
    const text = raw
        .replace(/<[^>]+>/g, ' ') // html tags
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // md images
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // md links → label
        .replace(/[#*_>`~|]/g, '') // md syntax
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= 150) return text;
    return `${text.slice(0, 150).replace(/\s+\S*$/, '')}…`;
}

function cleanTitle(title: string): string {
    return title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '');
}

/**
 * The real feed, sky-styled: search + type filters + load-more
 * pagination (mirrors the live BlogList behavior), rendered as glassy
 * light cards on the calm sky. 1 column on phones → 2 → 3.
 */
export default function SkyBlogFeed({ posts }: SkyBlogFeedProps) {
    const [filter, setFilter] = useState<Filter>('ALL');
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const filteredPosts = useMemo(() => {
        const q = search.toLowerCase();
        return posts.filter((post) => {
            const matchesType = filter === 'ALL' || post.type === (filter as PostType);
            const matchesSearch =
                post.title.toLowerCase().includes(q) ||
                (post.content || '').toLowerCase().includes(q);
            return matchesType && matchesSearch && post.isPublished;
        });
    }, [posts, filter, search]);

    const visiblePosts = filteredPosts.slice(0, visibleCount);
    const hasMore = visiblePosts.length < filteredPosts.length;

    return (
        <section className={styles.feed}>
            <div className={styles.inner}>
                <div className={styles.controls}>
                    <input
                        type="text"
                        placeholder="Search updates…"
                        aria-label="Search updates"
                        className={styles.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className={styles.filters} role="group" aria-label="Filter by type">
                        {FILTERS.map((type) => (
                            <button
                                key={type}
                                type="button"
                                className={`${styles.filterBtn} ${filter === type ? styles.filterActive : ''}`}
                                onClick={() => {
                                    setFilter(type);
                                    setVisibleCount(PAGE_SIZE);
                                }}
                            >
                                {type === 'ALL' ? 'All Updates' : type}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.grid}>
                    {visiblePosts.map((post) => {
                        const color = TAG_COLORS[post.type] || DEFAULT_TAG_COLOR;
                        const img = getImage(post);
                        const excerpt = getExcerpt(post);
                        return (
                            <Link
                                key={post.id || post.slug}
                                href={`/blog/${post.slug}`}
                                className={styles.card}
                            >
                                <div className={styles.media}>
                                    {img ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={img} alt="" loading="lazy" className={styles.image} />
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
                                        <span
                                            className={styles.time}
                                            title={new Date(post.timestamp).toLocaleString()}
                                        >
                                            {getRelativeTime(post.timestamp)}
                                        </span>
                                    </div>
                                    <h2 className={styles.cardTitle}>{cleanTitle(post.title)}</h2>
                                    {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
                                    <span className={styles.readMore}>Read the drop →</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {visiblePosts.length === 0 && (
                    <div className={styles.empty}>
                        <span className={styles.emptyGlyph} aria-hidden="true">雲</span>
                        <p>No updates found up here. Try a different search or filter.</p>
                    </div>
                )}

                {hasMore && (
                    <div className={styles.loadMoreRow}>
                        <button
                            type="button"
                            className={styles.loadMore}
                            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                        >
                            Load more drops
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
