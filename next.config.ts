import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
} as any;

export default nextConfig;
