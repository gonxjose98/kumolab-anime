/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["@napi-rs/canvas"],

    typescript: {
        ignoreBuildErrors: true,
    },
};

export default nextConfig;
