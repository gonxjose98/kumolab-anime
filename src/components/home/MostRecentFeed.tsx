
import styles from './MostRecentFeed.module.css';
import { BlogPost } from '@/types';
import Link from 'next/link';

interface MostRecentFeedProps {
    posts: BlogPost[];
}

const MostRecentFeed = ({ posts }: MostRecentFeedProps) => {
    // Filter out: Daily Drops (DROP) and Community Night (COMMUNITY)
    const filteredPosts = posts.filter(p => p.type !== 'DROP' && p.type !== 'COMMUNITY');

    if (filteredPosts.length === 0) return null;

    return (
        <section className={styles.section}>
            <div className="container">
                <h2 className={styles.sectionTitle}>MOST RECENT</h2>

                <div className={styles.feed}>
                    {filteredPosts.map((post) => (
                        <Link href={`/blog/${post.slug}`} key={post.id} className={styles.card}>
                            <div className={styles.content}>
                                <div className={styles.meta}>
                                    <time className={styles.date}>
                                        {new Date(post.timestamp).toLocaleDateString(undefined, {
                                            month: 'long',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </time>
                                </div>
                                <h3 className={styles.title}>
                                    {post.title.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, '')}
                                </h3>
                            </div>

                            <div className={styles.imageWrapper}>
                                {post.image ? (
                                    <img src={post.image} alt={post.title} className={styles.image} />
                                ) : (
                                    <div className={styles.placeholder} />
                                )}
                                <span className={styles.badge}>{post.type}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default MostRecentFeed;
