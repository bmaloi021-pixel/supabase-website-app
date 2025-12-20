import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {},
  experimental: {
    esmExternals: false,
  },
};

export default nextConfig;
