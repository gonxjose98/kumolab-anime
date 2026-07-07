import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog';
import { getFeaturedProducts } from '@/lib/merch';
import type { BlogPost, Product } from '@/types';
import NightSky from '@/components/redesign-b/NightSky';
import HeroB from '@/components/redesign-b/HeroB';
import ReachBar from '@/components/redesign-b/ReachBar';
import CloudCollection from '@/components/redesign-b/CloudCollection';
import FeedB from '@/components/redesign-b/FeedB';
import Forecast from '@/components/redesign-b/Forecast';
import FooterB from '@/components/redesign-b/FooterB';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
    title: 'KumoLab — Night Sky (Redesign Preview B)',
    robots: { index: false, follow: false },
};

export default async function RedesignBPage() {
    let posts: BlogPost[] = [];
    let products: Product[] = [];

    const [postsResult, productsResult] = await Promise.allSettled([
        getPosts(),
        getFeaturedProducts(),
    ]);

    if (postsResult.status === 'fulfilled') {
        posts = postsResult.value;
    } else {
        console.error('[redesign-b] Failed to fetch posts:', postsResult.reason);
    }

    if (productsResult.status === 'fulfilled') {
        products = productsResult.value;
    } else {
        console.error('[redesign-b] Failed to fetch products:', productsResult.reason);
    }

    return (
        <div className={styles.page}>
            <NightSky />
            <div className={styles.content}>
                <HeroB />
                <ReachBar />
                <CloudCollection products={products} />
                <FeedB posts={posts} />
                <Forecast />
                <FooterB />
            </div>
        </div>
    );
}
