'use client';

import styles from './SkeletonLoader.module.css';

// Hero Skeleton
export const HeroSkeleton = () => (
    <section className={styles.heroSkeleton}>
        <div className={styles.heroContent}>
            <div className={`${styles.skeleton} ${styles.heroTitle}`} />
            <div className={`${styles.skeleton} ${styles.heroSubtitle}`} />
            <div className={`${styles.skeleton} ${styles.heroButton}`} />
        </div>
    </section>
);

// Stats Bar Skeleton
export const StatsBarSkeleton = () => (
    <section className={styles.statsSkeleton}>
        <div className={styles.statsContainer}>
            {[1, 2, 3].map((i) => (
                <div key={i} className={styles.statItem}>
                    <div className={`${styles.skeleton} ${styles.statIcon}`} />
                    <div className={`${styles.skeleton} ${styles.statValue}`} />
                </div>
            ))}
        </div>
    </section>
);

// Blog Card Skeleton
export const BlogCardSkeleton = () => (
    <div className={styles.cardSkeleton}>
        <div className={`${styles.skeleton} ${styles.cardImage}`} />
        <div className={styles.cardContent}>
            <div className={`${styles.skeleton} ${styles.cardMeta}`} />
            <div className={`${styles.skeleton} ${styles.cardTitle}`} />
            <div className={`${styles.skeleton} ${styles.cardTitleShort}`} />
        </div>
    </div>
);

// Blog List Skeleton
export const BlogListSkeleton = ({ count = 6 }: { count?: number }) => (
    <div className={styles.blogListSkeleton}>
        {Array.from({ length: count }).map((_, i) => (
            <BlogCardSkeleton key={i} />
        ))}
    </div>
);

// Today's Drops Skeleton
export const TodaysDropsSkeleton = () => (
    <section className={styles.dropsSkeleton}>
        <div className={`${styles.skeleton} ${styles.dropsTitle}`} />
        <div className={styles.dropsList}>
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.dropCardSkeleton}>
                    <div className={`${styles.skeleton} ${styles.dropImage}`} />
                    <div className={`${styles.skeleton} ${styles.dropTitle}`} />
                </div>
            ))}
        </div>
    </section>
);

// Confirmation Alert Skeleton
export const ConfirmationAlertSkeleton = () => (
    <div className={styles.alertSkeleton}>
        <div className={styles.alertContent}>
            <div className={`${styles.skeleton} ${styles.alertLabel}`} />
            <div className={`${styles.skeleton} ${styles.alertTitle}`} />
            <div className={`${styles.skeleton} ${styles.alertExcerpt}`} />
        </div>
        <div className={`${styles.skeleton} ${styles.alertImage}`} />
    </div>
);

// Full Page Skeleton
export const HomePageSkeleton = () => (
    <div className={styles.pageSkeleton}>
        <HeroSkeleton />
        <StatsBarSkeleton />
        <ConfirmationAlertSkeleton />
        <TodaysDropsSkeleton />
    </div>
);
