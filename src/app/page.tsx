// Home: the v3 design (painted sky + sea, Today in anime). Site-wide metadata
// comes from the root layout. ISR: refresh at most every 5 min; publishing calls
// revalidatePath('/') so new posts appear immediately.
import { getPosts } from '@/lib/blog';
import { getFeaturedProducts } from '@/lib/merch';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BlogPost, Product } from '@/types';
import HomeV3, { type TrendingShow } from '@/components/home-v3/HomeV3';

export const revalidate = 300;


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

export default async function HomePage() {
    let posts: BlogPost[] = [];
    let products: Product[] = [];
    let trending: TrendingShow[] = [];
    let nextBig: TrendingShow | null = null;
    try { posts = await getPosts(); } catch (e) { console.error('[home] posts', e); }
    try { products = await getFeaturedProducts(); } catch (e) { console.error('[home] products', e); }
    try { trending = await getTrending(); } catch (e) { console.error('[home] trending', e); }
    try { nextBig = await getNextBig(); } catch (e) { console.error('[home] nextBig', e); }
    return <HomeV3 posts={posts} products={products} trending={trending} nextBig={nextBig} />;
}
