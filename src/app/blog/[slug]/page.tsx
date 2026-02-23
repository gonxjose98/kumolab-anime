import { getPostBySlug, getPosts } from '@/lib/blog';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import styles from './post.module.css';

interface BlogPostPageProps {
    params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
    try {
        const posts = await getPosts();
        return posts.map((post) => ({
            slug: post.slug,
        }));
    } catch (error) {
        console.error('[generateStaticParams] Failed to fetch posts:', error);
        // Return empty array - pages will be generated on-demand
        return [];
    }
}

export const dynamicParams = true; // Allow dynamic generation of pages not in static params
export const revalidate = 60;

// Dynamic SEO metadata generation
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
        return {
            title: 'Post Not Found | KumoLab',
            description: 'The requested post could not be found.'
        };
    }

    const title = post.seoTitle || `${post.title} | KumoLab`;
    const description = post.metaDescription || `Latest anime news: ${post.title}. Verified and accurate updates from KumoLab.`;
    const url = `https://kumolab-anime.com/blog/${post.slug}`;
    const image = post.image || 'https://kumolab-anime.com/og-image.png';

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url,
            siteName: 'KumoLab',
            images: [
                {
                    url: image,
                    width: 1080,
                    height: 1350,
                    alt: post.title
                }
            ],
            locale: 'en_US',
            type: 'article',
            publishedTime: post.timestamp,
            modifiedTime: post.timestamp,
            authors: ['KumoLab']
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [image],
            creator: '@KumoLabAnime'
        },
        alternates: {
            canonical: url
        }
    };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
        notFound();
    }

    // NewsArticle structured data for SEO
    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: post.seoTitle || post.title,
        description: post.metaDescription || post.content.substring(0, 160),
        image: post.image,
        datePublished: post.timestamp,
        dateModified: post.timestamp,
        author: {
            '@type': 'Organization',
            name: 'KumoLab'
        },
        publisher: {
            '@type': 'Organization',
            name: 'KumoLab',
            logo: {
                '@type': 'ImageObject',
                url: 'https://kumolab-anime.com/logo.png'
            }
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `https://kumolab-anime.com/blog/${post.slug}`
        }
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
            <article className={styles.container}>
                {post.image && (
                    <div className={styles.heroImage}>
                        <img 
                            src={post.image} 
                            alt={`${post.title} - ${post.claimType ? post.claimType.replace(/_/g, ' ') : 'Anime News'} | KumoLab`}
                        />
                    </div>
                )}

            <div className={styles.header}>
                <div className={styles.meta}>
                    {/* <span className={styles.badge}>{post.headline || post.type}</span> */}
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

            <div className={`${styles.content} ${post.type === 'DROP' ? styles.dropContent : ''}`}>
                {post.type === 'DROP' ? (
                    // Specialized Editorial Rendering for Daily Drops
                    post.content.split('\n\n').map((block, index) => {
                        const lines = block.split('\n');
                        // If it's a Title + Subline pair (2 lines)
                        if (lines.length === 2 && index > 1) {
                            return (
                                <div key={index} className={styles.dropItem}>
                                    <h3 className={styles.dropTitle}>{lines[0]}</h3>
                                    <p className={styles.dropSubline}>{lines[1]}</p>
                                </div>
                            );
                        }
                        // Intro text or single lines
                        return <p key={index} className={styles.paragraph}>{block}</p>;
                    })
                ) : (
                    // Standard Blog Rendering
                    post.content.split('\n').map((paragraph, index) => (
                        <p key={index} className={styles.paragraph}>{paragraph}</p>
                    ))
                )}
            </div>

            </article>
        </>
    );
}
