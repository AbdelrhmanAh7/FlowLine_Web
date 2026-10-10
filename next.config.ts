import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate build dir lets the test server run beside the dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["pg"],
  // Credential surfaces (docs/security/CREDENTIALS_DESIGN.md MUST 10, 21): OAuth callbacks carry codes/state in the URL
  // and the admin panel handles secrets — never leak their URLs through Referer, never cache them.
  async headers() {
    const secure = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/admin", headers: secure },
      { source: "/admin/:path*", headers: secure },
      { source: "/api/platform/:path*", headers: secure },
      { source: "/api/oauth/callback", headers: secure },
      { source: "/api/auth/callback/:path*", headers: secure },
      { source: "/api/sso/callback", headers: secure },
      // Landing demo media (#100): file names carry a content hash, so they never change under the same URL. Next's default for public/ is max-age=0.
      { source: "/media/demo/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
