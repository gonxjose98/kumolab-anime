import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog';
import { getFeaturedProducts } from '@/lib/merch';
import { BlogPost, Product } from '@/types';
import DawnHome from '@/components/redesign-a/DawnHome';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
    title: 'KumoLab — Cloud Sea at Dawn (Redesign Preview A)',
    description:
        'Preview of the KumoLab homepage redesign — Direction A: Cloud Sea / Dawn.',
    robots: { index: false, follow: false },
};

/**
 * /redesign-a — non-destructive homepage redesign preview.
 * Direction A: "Cloud Sea at Dawn". Uses live data via the existing
 * read-only fetchers; never touches the production homepage.
 */
export default async function RedesignAPage() {
    let posts: BlogPost[] = [];
    let products: Product[] = [];

    try {
        posts = await getPosts();
    } catch (error) {
        console.error('[redesign-a] Failed to fetch posts:', error);
    }

    try {
        products = await getFeaturedProducts();
    } catch (error) {
        console.error('[redesign-a] Failed to fetch products:', error);
    }

    return <DawnHome posts={posts} products={products} />;
}
