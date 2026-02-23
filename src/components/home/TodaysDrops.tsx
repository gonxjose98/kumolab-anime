'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Play } from 'lucide-react';
import { BlogPost } from '@/types';
import styles from './TodaysDrops.module.css';

interface TodaysDropsProps {
    posts: BlogPost[];
}

const TodaysDrops = ({ posts }: TodaysDropsProps) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Filter for today's drops
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysDrops = posts.filter(post => {
            if (post.type !== 'DROP') return false;
            const postDate = new Date(post.timestamp);
            postDate.setHours(0, 0, 0, 0);
            return postDate.getTime() === today.getTime();
        });

        setIsVisible(todaysDrops.length > 0);
    }, [posts]);

    if (!isVisible) return null;

    // Get today's drops
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysDrops = posts
        .filter(post => {
            if (post.type !== 'DROP') return false;
            const postDate = new Date(post.timestamp);
            postDate.setHours(0, 0, 0, 0);
            return postDate.getTime() === today.getTime();
        })
        .slice(0, 6); // Limit to 6 items

    if (todaysDrops.length === 0) return null;

    return (
        <section className={styles.section}>
            <div className="container">
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        <span className={styles.icon}>📅</span>
                        Today&apos;s Drops
                    </h2>
                    <Link href="/blog?filter=DROP" className={styles.viewAll}>
                        View All
                        <ChevronRight size={16} />
                    </Link>
                </div>

                <div className={styles.scrollContainer}>
                    <div className={styles.dropsList}>
                        {todaysDrops.map((drop) => (
                            <Link 
                                href={`/blog/${drop.slug}`} 
                                key={drop.id}
                                className={styles.dropCard}
                            >
                                <div className={styles.imageWrapper}>
                                    {drop.image ? (
                                        <img 
                                            src={drop.image} 
                                            alt={drop.title}
                                            className={styles.image}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className={styles.placeholder}>
                                            <Play size={24} />
                                        </div>
                                    )}
                                    <div className={styles.playOverlay}>
                                        <Play size={20} fill="white" />
                                    </div>
                                </div>
                                <div className={styles.content}>
                                    <h3 className={styles.dropTitle}>
                                        {drop.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '')}
                                    </h3>
                                    <span className={styles.episode}>New Episode</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TodaysDrops;
