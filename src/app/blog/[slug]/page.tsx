'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BlogPost } from '@/types';
import styles from './post.module.css';

export default function BlogPostPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const [post, setPost] = useState<BlogPost | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!slug) return;
        
        async function fetchPost() {
            try {
                // Use public API endpoint instead of admin client
                const response = await fetch(`/api/posts?slug=${encodeURIComponent(slug)}`);
                
                if (!response.ok) {
                    throw new Error('Post not found');
                }
                
                const data = await response.json();
                
                if (!data || !data.is_published) {
                    setPost(null);
                } else {
                    setPost(data);
                    // Update page title
                    document.title = data.seoTitle || `${data.title} | KumoLab`;
                }
            } catch (e) {
                console.error('Error fetching post:', e);
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

    return (
        <article className={styles.container}>
            {post.image && (
                <div className={styles.heroImage}>
                    <img 
                        src={`${post.image}${post.updated_at ? `?v=${new Date(post.updated_at).getTime()}` : ''}`}
                        alt={`${post.title} - ${post.claimType ? post.claimType.replace(/_/g, ' ') : 'Anime News'} | KumoLab`}
                    />
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.meta}>
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

            {/* YouTube Video Embed for Trailers */}
            {(post.type === 'TRAILER' || post.type === 'TEASER') && post.youtube_video_id && (
                <div className={styles.videoSection}>
                    <div className={styles.videoWrapper}>
                        <iframe
                            src={`https://www.youtube.com/embed/${post.youtube_video_id}?rel=0`}
                            title={post.title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className={styles.videoIframe}
                        />
                    </div>
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
                        {post.content.split('\n\n').map((block: string, index: number) => {
                            // Check if it's a video embed line
                            if (block.includes('youtube.com/embed')) {
                                return null; // Already shown above
                            }
                            // Check if it's a YouTube link
                            if (block.includes('youtube.com/watch')) {
                                return (
                                    <div key={index} className={styles.youtubeLink}>
                                        <a href={block.trim()} target="_blank" rel="noopener noreferrer" className={styles.watchButton}>
                                            ▶️ Watch on YouTube
                                        </a>
                                    </div>
                                );
                            }
                            // Render as paragraph or markdown
                            if (block.startsWith('🎬') || block.startsWith('#')) {
                                return <p key={index} className={styles.highlightBlock}>{block}</p>;
                            }
                            return <p key={index} className={styles.paragraph}>{block}</p>;
                        })}
                    </div>
                )}
            </div>
        </article>
    );
}
