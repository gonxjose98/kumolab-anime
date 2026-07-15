import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog';
import { getFeaturedProducts } from '@/lib/merch';
import { BlogPost, Product } from '@/types';
import SkyHome from '@/components/redesign-sky/SkyHome';

// ISR: cached render, refreshed at most every 5 min (revalidated on publish).
export const revalidate = 300;

export const metadata: Metadata = {
    title: 'KumoLab — Sea to Sky (Redesign Preview: Sky)',
    description:
        'Preview of the KumoLab homepage redesign — Sky direction: a cel-shaded scroll journey from the sea, through the clouds, into a clear blue sky.',
    robots: { index: false, follow: false },
};

/**
 * /redesign-sky — non-destructive homepage redesign preview.
 * "Sea to Sky": bright cel-shaded ocean → up through cumulus → clear
 * brilliant blue. Uses live data via the existing read-only fetchers;
 * never touches the production homepage or /redesign-a.
 */
export default async function RedesignSkyPage() {
    let posts: BlogPost[] = [];
    let products: Product[] = [];

    try {
        posts = await getPosts();
    } catch (error) {
        console.error('[redesign-sky] Failed to fetch posts:', error);
    }

    try {
        // Falls back to ALL products when nothing is flagged featured, so the
        // band shows the real catalogue whenever Printful responds at all.
        products = await getFeaturedProducts();
    } catch (error) {
        console.error('[redesign-sky] Failed to fetch products:', error);
    }

    return <SkyHome posts={posts} products={products} />;
}
