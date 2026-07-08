/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@napi-rs/canvas", "ffmpeg-static", "fluent-ffmpeg"],
    // Make sure the ffmpeg binary + Outfit font ship with the cron
    // function. yt-dlp lives on the Render worker now, not in this bundle.
    outputFileTracingIncludes: {
        '/api/cron/**': [
            './node_modules/ffmpeg-static/**',
            './public/fonts/**',
        ],
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
            },
            {
                // Cross-origin isolation for the Studio route only — enables the
                // multithreaded FFmpeg.wasm core (SharedArrayBuffer). Scoped to
                // this path so it never affects the rest of the admin/storefront
                // (global COEP would break cross-origin images + OAuth popups).
                source: '/admin/post/:id/studio',
                headers: [
                    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                    { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }
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
