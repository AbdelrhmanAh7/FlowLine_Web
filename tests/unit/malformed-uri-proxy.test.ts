import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { hasMalformedPercentEscape } from "@/lib/uri";
import { proxy } from "@/proxy";

describe("hasMalformedPercentEscape", () => {
  it.each([
    ["/w/%E0%A4%A/flows", ""],
    ["/w/acme", "?q=%zz"],
    ["/w/acme", "?q=100%"],
    ["/w/acme", "?a=1&b=%E0%A4%A"],
    ["/w/acme", "?%=1"],
  ])("rejects %s%s", (path, search) => expect(hasMalformedPercentEscape(path, search)).toBe(true));

  it.each([
    ["/w/acme", ""],
    ["/w/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7", "?q=%D8%A7&x=a+b&y=%25%26%21"],
    ["/w/acme", "?"],
    ["/w/acme", "?q=%20%20"],
  ])("accepts %s%s", (path, search) => expect(hasMalformedPercentEscape(path, search)).toBe(false));
});

describe("proxy", () => {
  const call = (url: string) => proxy(new NextRequest(`http://localhost:3000${url}`));

  it("passes a valid request through", () => {
    const res = call("/w/acme?q=%D8%A7");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("answers a malformed query on a page with a 404 rewrite", () => {
    const res = call("/w/acme?q=%E0%A4%A");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/not-found");
  });

  it("answers a malformed API path with bounded JSON 404", async () => {
    const res = call("/api/flows/%zz");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
  });
});
