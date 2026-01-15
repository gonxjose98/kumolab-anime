import Link from 'next/link';
import { BlogPost } from '@/types';
import styles from './BlogCard.module.css';

interface BlogCardProps {
    post: BlogPost;
}

const BlogCard = ({ post }: BlogCardProps) => {
    // Rule 4: Card overlay text mapping
    const getOverlayText = () => {
        if (post.type !== 'INTEL' || !post.claimType) return post.type;

        const dateStr = post.premiereDate;
        const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }) : '';

        switch (post.claimType) {
            case 'confirmed': return `PREMIERES ${formattedDate}`;
            case 'premiered': return `PREMIERED ${formattedDate}`;
            case 'now_streaming': return "NOW STREAMING";
            case 'delayed': return "DELAYED";
            case 'trailer': return "NEW TRAILER";
            case 'finale_aired': return "FINALE AIRED";
            default: return post.type;
        }
    };

    return (
        <Link href={`/blog/${post.slug}`} className={styles.card}>
            <div className={styles.imageWrapper}>
                {post.image ? (
                    <img src={post.image} alt={post.title} className={styles.image} />
                ) : (
                    <div className={styles.placeholder} />
                )}
                <span className={`${styles.badge} ${post.type === 'INTEL' ? styles.intelBadge : ''}`}>
                    {getOverlayText()}
                </span>
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
