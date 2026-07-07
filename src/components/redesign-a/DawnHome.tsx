import { BlogPost, Product } from '@/types';
import styles from './DawnHome.module.css';
import Hero from './Hero';
import ReachBar from './ReachBar';
import CloudCollection from './CloudCollection';
import DriftFeed from './DriftFeed';
import Forecast from './Forecast';
import DawnFooter from './DawnFooter';

interface DawnHomeProps {
    posts: BlogPost[];
    products: Product[];
}

/**
 * Redesign A — "Cloud Sea at Dawn".
 * Server shell that establishes the dawn palette + below-the-horizon dusk
 * ambience, then composes the client sections.
 */
export default function DawnHome({ posts, products }: DawnHomeProps) {
    return (
        <div className={styles.page}>
            <Hero />
            <div className={styles.below}>
                <div className={styles.ambience} aria-hidden="true">
                    <div className={styles.wispA} />
                    <div className={styles.wispB} />
                </div>
                <ReachBar />
                <CloudCollection products={products} />
                <DriftFeed posts={posts} />
                <Forecast />
                <DawnFooter />
            </div>
        </div>
    );
}
