import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {},
  transpilePackages: ["@supabase/supabase-js", "@supabase/ssr"],
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.alias["@supabase/supabase-js"] = require.resolve(
      "@supabase/supabase-js/dist/main/index.js"
    );
    return config;
  },
};

export default nextConfig;
