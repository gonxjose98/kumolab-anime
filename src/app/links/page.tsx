import type { Metadata } from 'next';
import { getLatestPosts } from '@/lib/blog';
import LinkHub from './LinkHub';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Utility landing for social bio traffic: not worth indexing, but its outbound
// links to the drops/shop should still pass equity.
export const metadata: Metadata = {
    title: 'KumoLab · Links',
    description: 'The latest anime drops, the shop, and the weekly Forecast. All in one place.',
    robots: { index: false, follow: true },
};

function cleanTitle(title: string): string {
    return title.replace(/\s+[—–-]\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
}

/**
 * The link-in-bio hub (Q3). Every social bio points here (via the /go/<channel>
 * clean links), and it routes that traffic to the three things that feed the
 * ecosystem loop: the newest drop, the shop, and the newsletter. Because it is
 * one fixed URL, the bio never needs editing again, and every tap is tracked.
 */
export default async function LinksPage() {
    let latest: { slug: string; title: string } | null = null;
    try {
        const posts = await getLatestPosts(1);
        if (posts[0]) latest = { slug: posts[0].slug, title: cleanTitle(posts[0].title) };
    } catch {
        latest = null;
    }

    return <LinkHub latest={latest} />;
}
