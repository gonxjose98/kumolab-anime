/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@napi-rs/canvas"],

    typescript: {
        ignoreBuildErrors: true,
    },
    env: {
        BUILD_TIME: new Date().toISOString(),
    },
    
    // SEO & Performance Optimizations
    images: {
        formats: ['image/webp', 'image/avif'],
        minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.supabase.co',
            },
            {
                protocol: 'https',
                hostname: 's4.anilist.co',
            },
            {
                protocol: 'https',
                hostname: '**.crunchyroll.com',
            }
        ],
    },
    
    // Compression
    compress: true,
    
    // Caching headers for static assets
    async headers() {
        return [
            {
                source: '/:path*.jpg|:path*.jpeg|:path*.png|:path*.webp',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable'
                    }
                ]
            },
            {
                source: '/fonts/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable'
                    }
                ]
            }
        ];
    },
    
    // Trailing slash for SEO consistency
    trailingSlash: false,
    
    // Experimental features for performance
    experimental: {
        optimizePackageImports: ['lucide-react'],
    }
};



export default nextConfig;
// Refreshed env vars for Pro Model
