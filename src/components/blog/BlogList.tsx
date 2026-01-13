'use client';

import { useState, useMemo } from 'react';
import { BlogPost, PostType } from '@/types';
import BlogCard from './BlogCard';
import styles from './BlogList.module.css';

interface BlogListProps {
    initialPosts: BlogPost[];
}

const BlogList = ({ initialPosts }: BlogListProps) => {
    const [filter, setFilter] = useState<PostType | 'ALL'>('ALL');
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(6);

    const filteredPosts = useMemo(() => {
        return initialPosts.filter((post) => {
            const matchesType = filter === 'ALL' || post.type === filter;
            const matchesSearch = post.title.toLowerCase().includes(search.toLowerCase()) ||
                post.content.toLowerCase().includes(search.toLowerCase());
            return matchesType && matchesSearch;
        });
    }, [initialPosts, filter, search]);

    const visiblePosts = filteredPosts.slice(0, visibleCount);
    const hasMore = visiblePosts.length < filteredPosts.length;

    return (
        <div className={styles.container}>
            <div className={styles.controls}>
                <input
                    type="text"
                    placeholder="Search updates..."
                    className={styles.search}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className={styles.filters}>
                    {(['ALL', 'DROP', 'INTEL', 'TRENDING', 'COMMUNITY'] as const).map((type) => (
                        <button
                            key={type}
                            className={`${styles.filterBtn} ${filter === type ? styles.active : ''}`}
                            onClick={() => {
                                setFilter(type);
                                setVisibleCount(6); // Reset pagination on filter change
                            }}
                        >
                            {type === 'ALL' ? 'All Updates' : type}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.grid}>
                {visiblePosts.map((post) => (
                    <BlogCard key={post.id} post={post} />
                ))}
            </div>

            {visiblePosts.length === 0 && (
                <div className={styles.empty}>No updates found matching your criteria.</div>
            )}

            {hasMore && (
                <div className={styles.loadMore}>
                    <button onClick={() => setVisibleCount((prev) => prev + 6)} className={styles.loadBtn}>
                        Load More
                    </button>
                </div>
            )}
        </div>
    );
};

export default BlogList;
