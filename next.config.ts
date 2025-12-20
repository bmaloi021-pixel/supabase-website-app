import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {},
  transpilePackages: ["@supabase/supabase-js", "@supabase/ssr"],
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.mainFields = ['main', 'module'];
    return config;
  },
};

export default nextConfig;
