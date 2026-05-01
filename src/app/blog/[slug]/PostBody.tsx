'use client';

import { useEffect, useState, useRef } from 'react';
import { BlogPost } from '@/types';
import { ArticleJsonLd } from '@/components/seo/JsonLd';
import ShareButtons from '@/components/blog/ShareButtons';
import styles from './post.module.css';

/** Get the tweet ID from a BlogPost (via field or content fallback) */
function getTweetId(post: BlogPost): string | null {
    if (post.twitter_tweet_id) return post.twitter_tweet_id;
    const match = post.content?.match(/Tweet ID:\s*(\d+)/);
    return match ? match[1] : null;
}

/** Get the tweet URL from a BlogPost */
function getTweetUrl(post: BlogPost): string | null {
    if (post.twitter_url) return post.twitter_url;
    const match = post.content?.match(/https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/);
    return match ? match[0] : null;
}

/** Clean content: remove raw metadata, Tweet IDs, placeholder text */
function cleanContent(content: string): string {
    return content
        .replace(/📱\s*\*\*X \(Twitter\) Post\*\*\s*/g, '')
        .replace(/From:\s*@\w+\s*/g, '')
        .replace(/🔗\s*\*\*Original post:\*\*\s*https?:\/\/\S+\s*/g, '')
        .replace(/Tweet ID:\s*\d+\s*/g, '')
        .replace(/\[Edit this post to add description and context\]\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function TwitterDetailEmbed({ tweetId }: { tweetId: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        const loadWidget = () => {
            const win = window as any;
            if (win.twttr?.widgets) {
                win.twttr.widgets.createTweet(tweetId, containerRef.current!, {
                    theme: 'dark',
                    align: 'center',
                    dnt: true,
                }).then(() => setLoaded(true));
            }
        };

        const win = window as any;
        if (win.twttr?.widgets) {
            loadWidget();
        } else {
            if (!document.getElementById('twitter-wjs')) {
                const script = document.createElement('script');
                script.id = 'twitter-wjs';
                script.src = 'https://platform.twitter.com/widgets.js';
                script.async = true;
                script.onload = loadWidget;
                document.head.appendChild(script);
            } else {
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
        <div ref={containerRef} className={styles.twitterEmbed}>
            {!loaded && (
                <div className={styles.twitterLoading}>
                    <div className={styles.loadingSpinner} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading post...</span>
                </div>
            )}
        </div>
    );
}

export default function PostBody({ slug }: { slug: string }) {
    const [post, setPost] = useState<BlogPost | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!slug) return;

        async function fetchPost() {
            try {
                const apiUrl = `/api/posts?slug=${encodeURIComponent(slug)}`;
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error(`Post not found: ${response.status}`);
                }

                const data = await response.json();
                const isLive = data?.is_published === true || data?.status === 'published';

                if (!data || !isLive) {
                    setPost(null);
                } else {
                    setPost(data);
                    document.title = data.seoTitle || `${data.title} | KumoLab`;

                    // Update meta description dynamically
                    const metaDesc = document.querySelector('meta[name="description"]');
                    if (metaDesc && data.metaDescription) {
                        metaDesc.setAttribute('content', data.metaDescription);
                    }
                }
            } catch (e) {
                console.error('[BlogPost] Error fetching post:', e);
                setPost(null);
            } finally {
                setLoading(false);
            }
        }

        fetchPost();
    }, [slug]);

    if (loading) {
        return (
            <div className={styles.container}>
                <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className={styles.container}>
                <div className="text-center py-20">
                    <h1 className="text-2xl font-bold mb-4">Post Not Found</h1>
                    <p className="text-neutral-500">The requested post could not be found.</p>
                </div>
            </div>
        );
    }

    const tweetId = getTweetId(post);
    const tweetUrl = getTweetUrl(post);
    const isTwitterPost = !!tweetId;
    const cleanedContent = cleanContent(post.content);

    const postUrl = `https://kumolab-anime.com/blog/${post.slug}`;

    return (
        <article className={styles.container}>
            <ArticleJsonLd post={post} />

            {/* Hero image (skip for Twitter posts — the embed IS the hero) */}
            {post.image && !isTwitterPost && (
                <div className={styles.heroImage}>
                    <img
                        src={post.image}
                        alt={`${post.title} - ${post.claimType ? post.claimType.replace(/_/g, ' ') : 'Anime News'} | KumoLab`}
                    />
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.meta}>
                    {post.source && (
                        <span className={styles.badge}>{post.source}</span>
                    )}
                    <time className={styles.date}>
                        {new Date(post.timestamp).toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            day: 'numeric'
                        })}
                    </time>
                </div>
                <h1 className={styles.title}>
                    {post.title.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '')}
                </h1>
            </div>

            {/* YouTube Video Embed — full native controls (rewind, fullscreen, captions) */}
            {post.youtube_video_id && (
                <div className={styles.videoSection}>
                    <div className={styles.videoWrapper}>
                        <iframe
                            src={`https://www.youtube.com/embed/${post.youtube_video_id}?rel=0&modestbranding=1&playsinline=1`}
                            title={post.title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            className={styles.videoIframe}
                        />
                    </div>
                </div>
            )}

            {/* Twitter/X Post Embed */}
            {tweetId && (
                <div className={styles.videoSection}>
                    <TwitterDetailEmbed tweetId={tweetId} />
                </div>
            )}

            <div className={`${styles.content} ${post.type === 'DROP' ? styles.dropContent : ''}`}>
                {post.type === 'DROP' ? (
                    post.content.split('\n\n').map((block: string, index: number) => {
                        const lines = block.split('\n');
                        if (lines.length === 2 && index > 1) {
                            return (
                                <div key={index} className={styles.dropItem}>
                                    <h3 className={styles.dropTitle}>{lines[0]}</h3>
                                    <p className={styles.dropSubline}>{lines[1]}</p>
                                </div>
                            );
                        }
                        return <p key={index} className={styles.paragraph}>{block}</p>;
                    })
                ) : (
                    <div className={styles.formattedContent}>
                        {cleanedContent.split('\n\n').map((block: string, index: number) => {
                            // Skip embed lines
                            if (block.includes('youtube.com/embed')) return null;
                            // YouTube link button
                            if (block.includes('youtube.com/watch')) {
                                return (
                                    <div key={index} className={styles.youtubeLink}>
                                        <a href={block.trim()} target="_blank" rel="noopener noreferrer" className={styles.watchButton}>
                                            Watch on YouTube
                                        </a>
                                    </div>
                                );
                            }
                            // Source attribution
                            if (block.startsWith('Source:')) {
                                return (
                                    <p key={index} className={styles.sourceAttribution}>
                                        {block}
                                    </p>
                                );
                            }
                            // URL lines — make them clickable
                            if (block.match(/^https?:\/\//)) {
                                return (
                                    <p key={index} className={styles.paragraph}>
                                        <a href={block.trim()} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>
                                            View original post
                                        </a>
                                    </p>
                                );
                            }
                            // Highlight blocks
                            if (block.startsWith('🎬') || block.startsWith('#')) {
                                return <p key={index} className={styles.highlightBlock}>{block}</p>;
                            }
                            // Bold markdown handling
                            if (block.includes('**')) {
                                const parts = block.split(/\*\*(.*?)\*\*/g);
                                return (
                                    <p key={index} className={styles.paragraph}>
                                        {parts.map((part, pi) => pi % 2 === 1 ? <strong key={pi}>{part}</strong> : part)}
                                    </p>
                                );
                            }
                            return <p key={index} className={styles.paragraph}>{block}</p>;
                        })}
                    </div>
                )}
            </div>

            <ShareButtons url={postUrl} title={post.title} />
        </article>
    );
}
