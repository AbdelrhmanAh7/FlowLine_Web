import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/test/auto-verify/route";

/**
 * Issue #124: GET /api/test/auto-verify is how a tester that can only navigate (no cookie API) opts in to the sign-up
 * auto-verify switch. It must not exist outside FLOWLINE_ENV=test, and it never redirects anywhere but /sign-up.
 */
const call = (url = "http://localhost/api/test/auto-verify") => GET(new Request(url), undefined);

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/test/auto-verify", () => {
  it.each([undefined, "", "production", "staging", "beta", "development", "Test"])("is a 404 that sets no cookie with FLOWLINE_ENV=%s", async (env) => {
    vi.stubEnv("FLOWLINE_ENV", env as string);
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("under FLOWLINE_ENV=test sets the opt-in cookie for this browser and continues to /sign-up", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    const res = await call("http://localhost/api/test/auto-verify?next=https://evil.example");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/sign-up");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [cookie, ...rest] = res.headers.getSetCookie();
    expect(rest).toEqual([]);
    expect(cookie).toMatch(/^fl_test_auto_verify=1; /);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });
});
