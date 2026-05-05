import Link from 'next/link';
import React, { useEffect, useRef } from 'react';
import { BlogPost } from '@/types';
import styles from './BlogCard.module.css';

interface BlogCardProps {
    post: BlogPost;
}

const BlogCard = ({ post }: BlogCardProps) => {
    const twitterRef = useRef<HTMLDivElement>(null);
    
    // Load Twitter widget script when component mounts
    useEffect(() => {
        const tweetIdMatch = post.content?.match(/Tweet ID:\s*(\d+)/);
        if (tweetIdMatch && !document.getElementById('twitter-widget-script')) {
            const script = document.createElement('script');
            script.id = 'twitter-widget-script';
            script.src = 'https://platform.twitter.com/widgets.js';
            script.async = true;
            script.charset = 'utf-8';
            document.body.appendChild(script);
        } else if (tweetIdMatch && (window as any).twttr) {
            // Re-render tweets if script already loaded
            (window as any).twttr.widgets.load(twitterRef.current);
        }
    }, [post.content]);
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
            // Use the YouTube thumbnail with object-fit: cover so the card
            // looks like every other post card. Full video plays on the
            // detail page — embedding live iframes per card meant the
            // user saw black bars whenever the video aspect (9:16 Shorts
            // vs 16:9 standard) didn't match the card aspect.
            const thumb = `https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg`;
            const fallback = `https://img.youtube.com/vi/${post.youtube_video_id}/hqdefault.jpg`;
            return (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={thumb}
                        alt={post.title}
                        className={styles.image}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallback; }}
                    />
                    <span className={styles.playBadge} aria-hidden>▶</span>
                </>
            );
        }

        // Check for X/Twitter embed in content (tweet ID stored in content)
        const tweetIdMatch = post.content?.match(/Tweet ID:\s*(\d+)/);
        const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;
        
        if (tweetId) {
            // Use Twitter's official embed widget
            return (
                <div ref={twitterRef} className={styles.videoContainer} style={{ minHeight: '300px' }}>
                    <blockquote className="twitter-tweet" data-theme="dark" data-conversation="none">
                        <a href={`https://twitter.com/i/status/${tweetId}`}></a>
                    </blockquote>
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
