// Issue #200 AC: route() error responses carry Cache-Control: no-store and Referrer-Policy: no-referrer. Request-level (no model).
// An anonymous caller gets the platform 404 and the generic 401; neither body may be cached or leak the URL as a referrer.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-200 AC1: error responses of route() are no-store and no-referrer",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const platform = await fetch(new URL("/api/platform/copy", app.baseUrl));
    expect(platform.status).toBe(404);
    expect(platform.headers.get("cache-control")).toBe("no-store");
    expect(platform.headers.get("referrer-policy")).toBe("no-referrer");

    const me = await fetch(new URL("/api/me", app.baseUrl));
    expect(me.status).toBe(401);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(me.headers.get("referrer-policy")).toBe("no-referrer");
  },
);
