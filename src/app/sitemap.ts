import { getPosts } from '@/lib/blog';

export default async function sitemap() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolab-anime.vercel.app';
    
    // Get all posts
    const posts = await getPosts();
    
    // Static pages
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
    
    // Dynamic blog post pages with lastmod
    const postPages = posts.map((post) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.timestamp).toISOString(),
        changeFrequency: 'weekly',
        priority: post.type === 'INTEL' ? 0.8 : 0.7
    }));
    
    return [...staticPages, ...postPages];
}
