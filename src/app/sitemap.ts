import { getPosts } from '@/lib/blog';

// Revalidate every hour
export const revalidate = 3600;

export default async function sitemap() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolab-anime.vercel.app';
    
    // Static pages (always included)
    const staticPages = [
        {
            url: baseUrl,
            lastModified: new Date().toISOString(),
            changeFrequency: 'daily',
            priority: 1.0
        },
        {
            url: `${baseUrl}/blog`,
            lastModified: new Date().toISOString(),
            changeFrequency: 'daily',
            priority: 0.9
        },
        {
            url: `${baseUrl}/about`,
            lastModified: new Date().toISOString(),
            changeFrequency: 'monthly',
            priority: 0.5
        }
    ];
    
    // Try to get posts, but don't fail build if Supabase is unavailable
    try {
        const posts = await getPosts();
        
        // Dynamic blog post pages with lastmod
        const postPages = posts.map((post) => ({
            url: `${baseUrl}/blog/${post.slug}`,
            lastModified: new Date(post.timestamp).toISOString(),
            changeFrequency: 'weekly',
            priority: post.type === 'INTEL' ? 0.8 : 0.7
        }));
        
        return [...staticPages, ...postPages];
    } catch (error) {
        console.error('[Sitemap] Failed to fetch posts:', error);
        // Return only static pages if posts fetch fails
        return staticPages;
    }
}
