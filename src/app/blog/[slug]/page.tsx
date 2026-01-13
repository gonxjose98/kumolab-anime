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
                    <span className={styles.badge}>{post.type}</span>
                    <time className={styles.date}>
                        {new Date(post.timestamp).toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </time>
                </div>
                <h1 className={styles.title}>{post.title}</h1>
            </div>

            <div className={styles.content}>
                {post.content.split('\n').map((paragraph, index) => (
                    <p key={index} className={styles.paragraph}>{paragraph}</p>
                ))}
            </div>
        </article>
    );
}
