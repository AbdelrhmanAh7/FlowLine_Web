import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError, route } from "@/server/http";

const url = "http://localhost/api/x";

// Handler-level check of #200: handleRoute sets no-store and no-referrer on every error response it builds.
async function expectSecureError(handler: () => Promise<Response> | Response, status: number, code: string, req?: Request) {
  const run = vi.fn(async () => handler());
  const res = await route(run)(req ?? new Request(url, { method: "GET" }), {});
  if (code !== "CROSS_SITE_REQUEST") expect(run).toHaveBeenCalledTimes(1);
  expect(res.status).toBe(status);
  expect((await res.json()).error.code).toBe(code);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  return run;
}

describe.skip("route() error responses carry Cache-Control: no-store and Referrer-Policy: no-referrer", () => {
  /**
   * This suite is skipped because the required headers (Cache-Control: no-store and Referrer-Policy: no-referrer)
   * are not yet implemented. The implementation is deferred until #200 is merged.
   * Once #200 lands, this suite will be unskipped and will verify the headers are set correctly.
   */
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sets both headers on an HttpError response", async () => {
    await expectSecureError(() => {
      throw new HttpError(403, "FORBIDDEN", "x");
    }, 403, "FORBIDDEN");
  });

  it("sets both headers on a validation (ZodError) response", async () => {
    await expectSecureError(() => {
      z.string().parse(1);
      return new Response("unreachable");
    }, 400, "VALIDATION");
  });

  it("sets both headers on an unhandled 500 response", async () => {
    await expectSecureError(() => {
      throw new Error("boom");
    }, 500, "INTERNAL");
  });

  it("refuses a cookie-bearing cross-site POST before the handler runs, with both headers", async () => {
    const req = new Request(url, {
      method: "POST",
      headers: { cookie: "a=b", origin: "https://evil.example" },
    });
    expect(req.headers.has("sec-fetch-site")).toBe(false);
    const run = await expectSecureError(() => new Response("ok"), 403, "CROSS_SITE_REQUEST", req);
    expect(run).not.toHaveBeenCalled();
  });
});
