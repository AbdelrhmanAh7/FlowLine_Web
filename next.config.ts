import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate build dir lets the test server run beside the dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["pg"],
  // CI's browser jobs build the test stack after the static leg has already run `tsc --noEmit` on the same commit, so they
  // skip Next's second type-check pass (FLOWLINE_SKIP_BUILD_TYPECHECK=1, set only in gate.yml). Every other build checks types.
  typescript: { ignoreBuildErrors: process.env.FLOWLINE_SKIP_BUILD_TYPECHECK === "1" },
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
    ];
  },
};

export default nextConfig;
