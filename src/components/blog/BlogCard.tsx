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
            // YouTube thumbnail cascade: maxres → sd → hq.
            //
            // Not every video has a maxres or sd thumbnail. Worse, when
            // those are missing YouTube returns a 120x90 GREY PLACEHOLDER
            // (status 200, not 404) — which load fine but pixelate when
            // stretched to fill the card. We detect that via naturalWidth
            // on load and step down to the next tier.
            const id = post.youtube_video_id;
            const tiers = [
                `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, // 1280x720, HD videos
                `https://i.ytimg.com/vi/${id}/sddefault.jpg`,     // 640x480, most modern uploads
                `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,     // 480x360, ALWAYS exists
            ];
            return (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={tiers[0]}
                        alt={post.title}
                        className={styles.image}
                        data-tier="0"
                        onLoad={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            // YouTube's grey placeholder for missing thumbs
                            // is 120x90. Anything that small means the tier
                            // doesn't exist — step down.
                            if (img.naturalWidth > 0 && img.naturalWidth <= 120) {
                                const cur = parseInt(img.dataset.tier || '0', 10);
                                if (cur < tiers.length - 1) {
                                    img.dataset.tier = String(cur + 1);
                                    img.src = tiers[cur + 1];
                                }
                            }
                        }}
                        onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            const cur = parseInt(img.dataset.tier || '0', 10);
                            if (cur < tiers.length - 1) {
                                img.dataset.tier = String(cur + 1);
                                img.src = tiers[cur + 1];
                            }
                        }}
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
