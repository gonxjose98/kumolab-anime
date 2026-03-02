'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './MostRecentFeed.module.css';
import { BlogPost } from '@/types';
import Link from 'next/link';

interface MostRecentFeedProps {
    posts: BlogPost[];
}

const TAG_COLORS: Record<string, { hex: string; r: number; g: number; b: number }> = {
    DROP: { hex: '#00d4ff', r: 0, g: 212, b: 255 },
    INTEL: { hex: '#7b61ff', r: 123, g: 97, b: 255 },
    TRENDING: { hex: '#ff6b35', r: 255, g: 107, b: 53 },
    COMMUNITY: { hex: '#00d4ff', r: 0, g: 212, b: 255 },
    CONFIRMATION_ALERT: { hex: '#ff3cac', r: 255, g: 60, b: 172 },
    TRAILER: { hex: '#ff3cac', r: 255, g: 60, b: 172 },
    TEASER: { hex: '#7b61ff', r: 123, g: 97, b: 255 },
};

const DEFAULT_TAG = { hex: '#00d4ff', r: 0, g: 212, b: 255 };

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

/** Detect if a post has embedded video (YouTube or X/Twitter) */
function getVideoInfo(post: BlogPost): { type: 'youtube'; videoId: string } | { type: 'twitter'; tweetId: string; tweetUrl: string } | null {
    if (post.youtube_video_id) {
        return { type: 'youtube', videoId: post.youtube_video_id };
    }
    // Check for Twitter post (via proper fields or content fallback)
    const tweetId = post.twitter_tweet_id || post.content?.match(/Tweet ID:\s*(\d+)/)?.[1];
    const tweetUrl = post.twitter_url || post.content?.match(/https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/)?.[0];
    if (tweetId) {
        return { type: 'twitter', tweetId, tweetUrl: tweetUrl || `https://x.com/i/status/${tweetId}` };
    }
    return null;
}

/** Twitter embed component — loads the tweet widget inline */
function TwitterEmbed({ tweetId, tweetUrl }: { tweetId: string; tweetUrl: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        // Load Twitter widgets.js if not already loaded
        const loadWidget = () => {
            const win = window as any;
            if (win.twttr?.widgets) {
                win.twttr.widgets.createTweet(tweetId, containerRef.current!, {
                    theme: 'dark',
                    align: 'center',
                    dnt: true,
                    conversation: 'none',
                }).then(() => setLoaded(true));
            }
        };

        const win = window as any;
        if (win.twttr?.widgets) {
            loadWidget();
        } else {
            // Load the script
            if (!document.getElementById('twitter-wjs')) {
                const script = document.createElement('script');
                script.id = 'twitter-wjs';
                script.src = 'https://platform.twitter.com/widgets.js';
                script.async = true;
                script.onload = loadWidget;
                document.head.appendChild(script);
            } else {
                // Script exists but not loaded yet — poll for it
                const interval = setInterval(() => {
                    if ((window as any).twttr?.widgets) {
                        clearInterval(interval);
                        loadWidget();
                    }
                }, 200);
                return () => clearInterval(interval);
            }
        }
    }, [tweetId]);

    return (
        <div
            ref={containerRef}
            className={styles.twitterEmbed}
            style={{ minHeight: loaded ? 'auto' : '300px' }}
        >
            {!loaded && (
                <div className={styles.twitterLoading}>
                    <div className={styles.loadingSpinner} />
                    <span>Loading post...</span>
                </div>
            )}
        </div>
    );
}

const MostRecentFeed = ({ posts }: MostRecentFeedProps) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
    const [expandedTweets, setExpandedTweets] = useState<Set<string>>(new Set());
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

    // Stop videos that scroll out of view
    useEffect(() => {
        if (playingVideos.size === 0) return;
        const c = containerRef.current;
        if (!c) return;

        const handler = () => {
            const cards = c.querySelectorAll('[data-fc]');
            let snappedIdx = 0;
            let minDist = Infinity;
            cards.forEach((card, i) => {
                const d = Math.abs(card.getBoundingClientRect().top - c.getBoundingClientRect().top);
                if (d < minDist) { minDist = d; snappedIdx = i; }
            });

            const snappedPost = feedPosts[snappedIdx];
            if (snappedPost) {
                setPlayingVideos(prev => {
                    const postId = snappedPost.id || String(snappedIdx);
                    if (prev.size === 1 && prev.has(postId)) return prev;
                    if (prev.size === 0) return prev;
                    const next = new Set<string>();
                    if (prev.has(postId)) next.add(postId);
                    return next;
                });
            }
        };

        c.addEventListener('scroll', handler, { passive: true });
        return () => c.removeEventListener('scroll', handler);
    }, [playingVideos.size > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    if (filteredPosts.length === 0) return null;

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
                    const tc = TAG_COLORS[post.type] || DEFAULT_TAG;
                    const tagColor = tc.hex;
                    const cleanTitle = post.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '');
                    const videoInfo = getVideoInfo(post);
                    const isYouTube = videoInfo?.type === 'youtube';
                    const isTwitter = videoInfo?.type === 'twitter';
                    const hasVideo = !!videoInfo;
                    const postKey = post.id || String(i);
                    const isPlaying = isYouTube && playingVideos.has(postKey);
                    const isTweetExpanded = isTwitter && expandedTweets.has(postKey);

                    // Determine image source
                    const imageSrc = isYouTube
                        ? `https://img.youtube.com/vi/${(videoInfo as any).videoId}/maxresdefault.jpg`
                        : post.image;

                    const cardInner = (
                        <>
                            {/* YouTube iframe when playing */}
                            {isYouTube && isPlaying && (
                                <iframe
                                    src={`https://www.youtube.com/embed/${(videoInfo as any).videoId}?autoplay=1&rel=0&modestbranding=1`}
                                    title={post.title}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                    allowFullScreen
                                    className={styles.videoIframe}
                                />
                            )}

                            {/* Twitter embed when expanded */}
                            {isTwitter && isTweetExpanded && (
                                <div className={styles.twitterEmbedWrapper}>
                                    <TwitterEmbed
                                        tweetId={(videoInfo as any).tweetId}
                                        tweetUrl={(videoInfo as any).tweetUrl}
                                    />
                                </div>
                            )}

                            {/* Background image (hidden when video is playing or tweet expanded) */}
                            {!isPlaying && !isTweetExpanded && imageSrc && (
                                <img
                                    src={imageSrc}
                                    alt=""
                                    loading="lazy"
                                    className={styles.cardImage}
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        if (isYouTube && target.src.includes('maxresdefault')) {
                                            target.src = `https://img.youtube.com/vi/${(videoInfo as any).videoId}/hqdefault.jpg`;
                                        } else if (!target.src.endsWith('/hero-bg-final.png')) {
                                            target.src = '/hero-bg-final.png';
                                        }
                                    }}
                                />
                            )}

                            {/* Fallback background for posts without images */}
                            {!isPlaying && !isTweetExpanded && !imageSrc && (
                                <div className={styles.cardFallback} />
                            )}

                            {!isTweetExpanded && <div className={styles.cardGradient} />}
                            {!isTweetExpanded && <div className={styles.cardScanlines} />}

                            {/* Play button for YouTube */}
                            {isYouTube && !isPlaying && (
                                <button
                                    className={styles.playButton}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setPlayingVideos(prev => new Set(prev).add(postKey));
                                    }}
                                    aria-label="Play video"
                                >
                                    <div className={styles.playButtonInner}>
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                    </div>
                                </button>
                            )}

                            {/* View post button for Twitter */}
                            {isTwitter && !isTweetExpanded && (
                                <button
                                    className={styles.playButton}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setExpandedTweets(prev => new Set(prev).add(postKey));
                                    }}
                                    aria-label="View post"
                                >
                                    <div className={styles.playButtonInner}>
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                        </svg>
                                    </div>
                                </button>
                            )}

                            {/* Tag */}
                            <div
                                className={styles.cardTag}
                                style={{
                                    '--tag-color': tagColor,
                                    '--tag-color-10': `rgba(${tc.r},${tc.g},${tc.b},0.1)`,
                                    '--tag-color-20': `rgba(${tc.r},${tc.g},${tc.b},0.2)`,
                                } as React.CSSProperties}
                            >
                                <span className={styles.tagDot} />
                                <span className={styles.tagText}>{post.type}</span>
                            </div>

                            {/* Video badge */}
                            {hasVideo && (
                                <div className={styles.videoBadge}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        {isTwitter ? (
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                        ) : (
                                            <path d="M8 5v14l11-7z"/>
                                        )}
                                    </svg>
                                    {isTwitter ? 'X POST' : 'VIDEO'}
                                </div>
                            )}

                            {/* Counter */}
                            <div className={styles.cardCounter}>
                                {String(i + 1).padStart(2, '0')}/{String(feedPosts.length).padStart(2, '0')}
                            </div>

                            {/* Bottom content */}
                            <div className={styles.cardBottom} style={isTweetExpanded ? { background: 'rgba(6,6,14,0.95)' } : undefined}>
                                <div className={styles.cardMeta}>
                                    {post.source && (
                                        <span className={styles.cardSource}>{post.source}</span>
                                    )}
                                    <span className={styles.cardTime}>{getRelativeTime(post.timestamp)}</span>
                                </div>
                                <h3 className={styles.cardTitle}>{cleanTitle}</h3>
                                {hasVideo && (
                                    <Link
                                        href={`/blog/${post.slug}`}
                                        className={styles.cardReadMore}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        View full post &rarr;
                                    </Link>
                                )}
                            </div>

                            {/* Corner accents */}
                            <span className={styles.cornerTL} style={{ borderColor: `rgba(${tc.r},${tc.g},${tc.b},0.25)` }} />
                            <span className={styles.cornerTR} style={{ borderColor: `rgba(${tc.r},${tc.g},${tc.b},0.25)` }} />
                            <span className={styles.cornerBL} style={{ borderColor: `rgba(${tc.r},${tc.g},${tc.b},0.25)` }} />
                            <span className={styles.cornerBR} style={{ borderColor: `rgba(${tc.r},${tc.g},${tc.b},0.25)` }} />
                        </>
                    );

                    // Video cards (YouTube or Twitter): use div wrapper for interactive content
                    if (hasVideo) {
                        return (
                            <div key={postKey} data-fc="" className={styles.card}>
                                {cardInner}
                            </div>
                        );
                    }

                    // All other cards: use Link wrapper
                    return (
                        <Link
                            href={`/blog/${post.slug}`}
                            key={postKey}
                            data-fc=""
                            className={styles.card}
                        >
                            {cardInner}
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
