import Link from 'next/link';
import { BlogPost } from '@/types';
import styles from './BlogCard.module.css';

interface BlogCardProps {
    post: BlogPost;
}

const BlogCard = ({ post }: BlogCardProps) => {
    // Rule 4: Card overlay text mapping
    const getOverlayText = () => {
        // Priority 1: User-defined headline (from Mission Control)
        if (post.headline) return post.headline;

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

    return (
        <Link href={`/blog/${post.slug}`} className={styles.card}>
            <div className={styles.imageWrapper}>
                {post.image ? (
                    <img src={post.image} alt={post.title} className={styles.image} />
                ) : (
                    <div className={styles.placeholder} />
                )}
                {/* REMOVED: Duplicate badge overlay to ensure Single Source of Truth. 
                    The backend now bakes all headlines directly into the visual asset. */}
                {/* <span className={`${styles.badge} ${post.type === 'INTEL' ? styles.intelBadge : ''}`}>
                    {getOverlayText()}
                </span> */}
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
