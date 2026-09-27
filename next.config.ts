import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate build dir lets the test server run beside the dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["pg"],
};

export default nextConfig;
