import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {},
  transpilePackages: ["@supabase/supabase-js", "@supabase/ssr"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sbhcpvqygnvnjhxacpms.supabase.co',
      },
    ],
  },
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.exportsFields = [];
    config.resolve.conditionNames = ['require', 'node'];
    return config;
  },
};

export default nextConfig;
