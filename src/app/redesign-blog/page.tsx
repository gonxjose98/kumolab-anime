import type { Metadata } from 'next';
import { getPosts } from '@/lib/blog';
import { BlogPost } from '@/types';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import SkyBlogFeed from './SkyBlogFeed';
import styles from './SkyBlog.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
    title: 'KumoLab — The Feed (Redesign Preview: Content Sky)',
    description:
        'Preview of the KumoLab blog on the content-page sky theme — a calm cel-shaded sky (bright day / starlit night) behind the real feed.',
    robots: { index: false, follow: false },
};

/**
 * /redesign-blog — non-destructive themed preview of the blog index.
 * Exemplar of the reusable "content-page sky theme": the calm sky
 * backdrop from src/components/sky-content wrapped around the REAL
 * feed (live Supabase posts via getPosts). Locks the pattern for the
 * other content pages (merch, about, legal). Never touches /blog.
 */
export default async function RedesignBlogPage() {
    let posts: BlogPost[] = [];

    try {
        posts = await getPosts();
    } catch (error) {
        console.error('[redesign-blog] Failed to fetch posts:', error);
    }

    return (
        <SkyContentRoot>
            <header className={styles.hero}>
                <p className={styles.kicker}>最新情報 · Fresh From Above the Clouds</p>
                <h1 className={styles.title}>The Feed</h1>
                <p className={styles.sub}>
                    Real-time anime intelligence, verified before it reaches you.
                    No fluff. No clickbait.
                </p>
            </header>
            <SkyBlogFeed posts={posts} />
            <SkyFooter />
        </SkyContentRoot>
    );
}
