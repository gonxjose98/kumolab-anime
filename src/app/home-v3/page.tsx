import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog';
import { getFeaturedProducts } from '@/lib/merch';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BlogPost, Product } from '@/types';
import HomeV3, { type TrendingShow } from '@/components/home-v3/HomeV3';

export const revalidate = 300;

export const metadata: Metadata = {
    title: 'KumoLab (Home v3 preview)',
    robots: { index: false, follow: false },
};

/** Top AniList-trending shows from the Release Radar table (facts only). */
async function getTrending(): Promise<TrendingShow[]> {
    const { data } = await supabaseAdmin
        .from('release_radar')
        .select('anilist_id, title_english, title_romaji, cover_image, banner_image, trending, popularity, next_airing_at, next_episode, status, site_url')
        .gt('trending', 0)
        .order('trending', { ascending: false })
        .limit(8);
    return (data || []).map((r: any) => ({
        id: r.anilist_id,
        title: r.title_english || r.title_romaji,
        image: r.cover_image || r.banner_image,
        popularity: r.popularity ?? 0,
        nextAiringAt: r.next_airing_at,
        nextEpisode: r.next_episode,
        status: r.status,
        url: r.site_url,
    }));
}

/** The most-followed show with an episode or premiere in the next 7 days. */
async function getNextBig(): Promise<TrendingShow | null> {
    const now = new Date();
    const week = new Date(Date.now() + 7 * 86400000);
    const { data } = await supabaseAdmin
        .from('release_radar')
        .select('anilist_id, title_english, title_romaji, cover_image, banner_image, popularity, next_airing_at, next_episode, status, site_url')
        .gt('next_airing_at', now.toISOString())
        .lt('next_airing_at', week.toISOString())
        .order('popularity', { ascending: false })
        .limit(1);
    const r: any = data?.[0];
    return r ? { id: r.anilist_id, title: r.title_english || r.title_romaji, image: r.cover_image || r.banner_image, popularity: r.popularity ?? 0, nextAiringAt: r.next_airing_at, nextEpisode: r.next_episode, status: r.status, url: r.site_url } : null;
}

export default async function HomeV3Page() {
    let posts: BlogPost[] = [];
    let products: Product[] = [];
    let trending: TrendingShow[] = [];
    let nextBig: TrendingShow | null = null;
    try { posts = await getPosts(); } catch (e) { console.error('[home-v3] posts', e); }
    try { products = await getFeaturedProducts(); } catch (e) { console.error('[home-v3] products', e); }
    try { trending = await getTrending(); } catch (e) { console.error('[home-v3] trending', e); }
    try { nextBig = await getNextBig(); } catch (e) { console.error('[home-v3] nextBig', e); }
    return <HomeV3 posts={posts} products={products} trending={trending} nextBig={nextBig} />;
}
