/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@napi-rs/canvas"],

    typescript: {
        ignoreBuildErrors: true,
    },
    env: {
        BUILD_TIME: new Date().toISOString(),
    },
};

export default nextConfig;
