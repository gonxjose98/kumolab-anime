import { getPosts } from '@/lib/blog';
import { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://kumolab-anime.com';
    
    // Get all posts
    const posts = await getPosts();
    
    // Static pages
    const staticPages = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 1.0
        },
        {
            url: `${baseUrl}/blog`,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 0.9
        },
        {
            url: `${baseUrl}/about`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.5
        }
    ];
    
    // Dynamic blog post pages with lastmod
    const postPages = posts.map((post) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.timestamp),
        changeFrequency: 'weekly' as const,
        priority: post.type === 'INTEL' ? 0.8 : 0.7
    }));
    
    return [...staticPages, ...postPages];
}
