import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPostBySlug, getExpiredRedirect, getPosts } from '@/lib/blog';
import { getFeaturedProducts } from '@/lib/merch';
import { BlogPost, Product } from '@/types';
import PostBody from './PostBody';
import ArticleCTA from './ArticleCTA';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';

export const dynamic = 'force-dynamic';

const SITE = 'https://kumolabanime.com';

/** Strip the trailing " - 2026-01-01 ..." slug-date suffix from raw titles. */
function cleanTitle(title: string): string {
    return title.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
}

/** Absolute OG image for a post: its key visual if present, else the site card. */
function ogImageFor(post: BlogPost): string {
    if (post.image) {
        return post.image.startsWith('http') ? post.image : `${SITE}${post.image}`;
    }
    return `${SITE}/og-image.png`;
}

/**
 * Per-article metadata (Q1). Until now every shared/social-clicked article link
 * rendered the site-wide OG card with no per-article title, description, or
 * image, and search engines saw a generic page. This makes each article a
 * first-class, shareable, indexable destination.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
        return { title: 'Post Not Found | KumoLab', robots: { index: false, follow: false } };
    }

    // seoTitle/metaDescription are populated by the generator but not declared
    // on BlogPost (same loose access pattern as JsonLd.tsx / generator.ts).
    const seo = post as BlogPost & { seoTitle?: string; metaDescription?: string };
    const title = seo.seoTitle || cleanTitle(post.title);
    const description =
        seo.metaDescription ||
        post.excerpt ||
        'Verified anime news, release dates, and trailers from KumoLab.';
    const url = `${SITE}/blog/${post.slug}`;
    const image = ogImageFor(post);

    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            type: 'article',
            url,
            siteName: 'KumoLab',
            title,
            description,
            images: [{ url: image, alt: title }],
            publishedTime: post.timestamp,
            modifiedTime: (post as { updated_at?: string }).updated_at || post.timestamp,
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [image],
        },
    };
}

/** Up to 3 other recent published drops, current post excluded, title-deduped. */
async function getRelated(slug: string): Promise<BlogPost[]> {
    try {
        const posts = await getPosts(); // published only, newest first
        const seen = new Set<string>();
        return posts
            .filter((p) => p.slug !== slug && p.isPublished)
            .filter((p) => {
                const key = p.title.substring(0, 30).toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 3);
    } catch {
        return [];
    }
}

/** One merch item for the teaser. Printful-cached, so cheap per render. */
async function getTeaserProduct(): Promise<Product | null> {
    try {
        const products = await getFeaturedProducts();
        return products[0] ?? null;
    } catch {
        return null;
    }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    const post = await getPostBySlug(slug);

    if (!post) {
        // Fork-2 expired post? 301-redirect to the social post so inbound links keep their equity.
        const redirectUrl = await getExpiredRedirect(slug);
        if (redirectUrl) redirect(redirectUrl);
    }

    // Only fetch the capture-band data when we actually have an article to show.
    const [related, product]: [BlogPost[], Product | null] = post
        ? await Promise.all([getRelated(slug), getTeaserProduct()])
        : [[], null];

    return (
        <SkyContentRoot>
            <PostBody slug={slug} initialPost={post ?? null} />
            {post && <ArticleCTA related={related} product={product} />}
            <SkyFooter />
        </SkyContentRoot>
    );
}
