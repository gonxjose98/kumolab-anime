import Link from 'next/link';
import React from 'react';
import { BlogPost } from '@/types';
import styles from './BlogCard.module.css';

interface BlogCardProps {
    post: BlogPost;
}

const BlogCard = ({ post }: BlogCardProps) => {
    // Rule 4: Card overlay text mapping
    const getOverlayText = () => {
        // Priority 1: User-defined headline (from Mission Control)
        if (post.headline) return post.headline;
        if (post.excerpt) return post.excerpt;

        // Priority 2: Intel-specific date mapping
        if (post.type === 'INTEL' && post.claimType) {
            const dateStr = post.premiereDate;
            const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            }) : '';

            switch (post.claimType) {
                case 'NEW_SEASON_CONFIRMED': return "SEASON CONFIRMED";
                case 'DATE_ANNOUNCED': return `PREMIERES ${formattedDate}`;
                case 'DELAY': return "PRODUCTION DELAY";
                case 'TRAILER_DROP': return "NEW TRAILER";
                case 'NEW_KEY_VISUAL': return "NEW VISUAL";
                case 'CAST_ADDITION': return "NEW CAST";
            }
        }

        // Priority 3: Fallback to Post Type
        return post.type;
    };

    // Render video embed (YouTube or X/Twitter)
    const renderVideoEmbed = () => {
        if (post.youtube_video_id) {
            return (
                <div className={styles.videoContainer}>
                    <iframe
                        src={`https://www.youtube.com/embed/${post.youtube_video_id}?autoplay=1&mute=1&loop=1&playlist=${post.youtube_video_id}&rel=0`}
                        title={post.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className={styles.videoIframe}
                    />
                </div>
            );
        }

        // Check for X/Twitter embed in content (tweet ID stored in content)
        const tweetIdMatch = post.content?.match(/Tweet ID:\s*(\d+)/);
        const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;
        
        if (tweetId) {
            return (
                <div className={styles.videoContainer}>
                    <iframe
                        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&cards=visible`}
                        title={post.title}
                        frameBorder="0"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        className={styles.videoIframe}
                        scrolling="no"
                        loading="lazy"
                    />
                </div>
            );
        }

        return null;
    };

    // Check for video embed - YouTube explicit field, X extracted from content
    const tweetIdMatch = post.content?.match(/Tweet ID:\s*(\d+)/);
    const hasVideoEmbed = post.youtube_video_id || tweetIdMatch;

    return (
        <Link href={`/blog/${post.slug}`} className={styles.card}>
            <div className={styles.imageWrapper}>
                {hasVideoEmbed ? (
                    renderVideoEmbed()
                ) : post.image ? (
                    <img 
                        src={post.image} 
                        alt={post.title} 
                        className={styles.image} 
                    />
                ) : (
                    <div className={styles.placeholder} />
                )}
            </div>
            <div className={styles.content}>
                <div className={styles.meta}>
                    <span className={styles.date}>
                        {new Date(post.timestamp).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </span>
                </div>
                <h3 className={styles.title}>
                    {post.title.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '')}
                </h3>
                {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
            </div>
        </Link>
    );
};

export default BlogCard;
