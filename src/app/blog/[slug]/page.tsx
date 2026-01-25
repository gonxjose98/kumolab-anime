import { getPostBySlug, getPosts } from '@/lib/blog';
import { notFound } from 'next/navigation';
import styles from './post.module.css';

interface BlogPostPageProps {
    params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
    const posts = await getPosts();
    return posts.map((post) => ({
        slug: post.slug,
    }));
}

export const revalidate = 60;

export default async function BlogPostPage({ params }: BlogPostPageProps) {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
        notFound();
    }

    return (
        <article className={styles.container}>
            {post.image && (
                <div className={styles.heroImage}>
                    <img src={post.image} alt={post.title} />
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.meta}>
                    <span className={styles.badge}>{post.headline || post.type}</span>
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
    );
}
