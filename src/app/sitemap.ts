// Static sitemap - no database calls at build time
export default function sitemap() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolab-anime.com';
    
    // Static pages only - blog posts will be discovered by Googlebot
    return [
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
}
