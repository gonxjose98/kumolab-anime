/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@napi-rs/canvas", "ffmpeg-static", "fluent-ffmpeg", "@distube/ytdl-core"],
    // Make sure the ffmpeg binary that ffmpeg-static downloads at install
    // time is actually bundled into the serverless function output. Without
    // this, Next.js's tracing skips the platform-specific binary and the
    // spawn() call ENOENTs at runtime.
    outputFileTracingIncludes: {
        '/api/cron/**': ['./node_modules/ffmpeg-static/**', './public/fonts/**'],
    },

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
                source: '/:path*.jpg',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable'
                    }
                ]
            },
            {
                source: '/:path*.jpeg',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable'
                    }
                ]
            },
            {
                source: '/:path*.png',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable'
                    }
                ]
            },
            {
                source: '/:path*.webp',
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
