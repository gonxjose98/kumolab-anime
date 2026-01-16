/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@napi-rs/canvas"],
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
};

export default nextConfig;
