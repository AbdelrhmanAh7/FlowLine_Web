import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError, route } from "@/server/http";

const url = "http://localhost/api/x";

// Depends on #200: handleRoute must set cache-control and referrer-policy on every error response.
async function expectSecureError(handler: () => Promise<Response> | Response, status: number, code: string, req?: Request) {
  const wrapped = route(async () => handler());
  const res = await wrapped(req ?? new Request(url, { method: "GET" }), {});
  expect(res.status).toBe(status);
  expect((await res.json()).error.code).toBe(code);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("route() error responses", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sets no-store and no-referrer on an HttpError response", async () => {
    await expectSecureError(() => {
      throw new HttpError(403, "FORBIDDEN", "x");
    }, 403, "FORBIDDEN");
  });

  it("sets no-store and no-referrer on a validation (ZodError) response", async () => {
    await expectSecureError(() => {
      z.string().parse(1);
      return new Response("unreachable");
    }, 400, "VALIDATION");
  });

  it("sets no-store and no-referrer on an unhandled 500 response", async () => {
    await expectSecureError(() => {
      throw new Error("boom");
    }, 500, "INTERNAL");
  });

  it("sets no-store and no-referrer on a cross-site CSRF refusal", async () => {
    const req = new Request(url, {
      method: "POST",
      headers: { cookie: "a=b", origin: "https://evil.example" },
    });
    await expectSecureError(() => new Response("ok"), 403, "CROSS_SITE_REQUEST", req);
  });
});
