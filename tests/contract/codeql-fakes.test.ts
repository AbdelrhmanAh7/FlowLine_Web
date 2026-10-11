/**
 * Contract tests for the CodeQL triage of the e2e fake servers (#114, part of #63):
 *   #5 stack-trace-exposure, #6 regex-injection, #7 resource-exhaustion, #9 unvalidated-redirect.
 * Notes and dismissal reasons: docs/security/codeql-triage-fakes.md.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { compileFaultPattern, safeRedirectTarget, slowDelayMs } from "../../e2e/fakes/safety";
import { PaddlePaymentAdapter } from "@/billing/paddle";
import { startFake, type Fake } from "./helpers";

let providers: Fake;
let ai: Awaited<ReturnType<typeof startFakeAi>>;
beforeAll(async () => {
  providers = await startFake();
  ai = await startFakeAi();
});
afterAll(async () => {
  await providers.close();
  await ai.close();
});

const postJson = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("#6 regex injection: fault patterns are matched as text, never compiled", () => {
  it("keeps the anchored and plain patterns the suites already use", () => {
    expect(compileFaultPattern("^/oauth/token$")?.test("/oauth/token")).toBe(true);
    expect(compileFaultPattern("^/oauth/token$")?.test("/x/oauth/token")).toBe(false);
    expect(compileFaultPattern("^/conversations\\.list$")?.test("/conversations.list")).toBe(true);
    expect(compileFaultPattern("^/conversations\\.list$")?.test("/conversationsXlist")).toBe(false);
    expect(compileFaultPattern("/v1/subscriptions/")?.test("/v1/subscriptions/sub_1")).toBe(true);
    expect(compileFaultPattern(":append")?.test("/v4/spreadsheets/s/values/A1:append")).toBe(true);
  });

  it("treats regex metacharacters as literal text", () => {
    expect(compileFaultPattern(".*")?.test("/anything")).toBe(false);
    expect(compileFaultPattern("(a+)+$")?.test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
    expect(compileFaultPattern("(")?.test("/a(b")).toBe(true);
  });

  it("rejects empty and oversized patterns", () => {
    expect(compileFaultPattern("")).toBeNull();
    expect(compileFaultPattern("a".repeat(201))).toBeNull();
  });

  it("warns server-side when a pattern drops regex syntax, so a never-firing fault is visible", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await postJson(`${providers.url}/__fake/fault`, { provider: "slack", pathPattern: ".*", mode: "500", times: 1 });
      expect(warn.mock.calls.flat().join("\n")).toMatch(/pathPattern/);
      warn.mockClear();
      // A lone `.` is a legitimate literal (`chat.postMessage`), so it stays silent.
      await postJson(`${providers.url}/__fake/fault`, { provider: "slack", pathPattern: "chat.postMessage", mode: "500", times: 1 });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      await postJson(`${providers.url}/__fake/reset`, {});
    }
  });

  it("the control API answers 400 for an oversized pattern and accepts an invalid-regex text", async () => {
    expect((await postJson(`${providers.url}/__fake/fault`, { provider: "slack", pathPattern: "a".repeat(500), mode: "500" })).status).toBe(400);
    expect((await postJson(`${providers.url}/__fake/fault`, { provider: "slack", pathPattern: "(", mode: "500", times: 1 })).status).toBe(200);
    await postJson(`${providers.url}/__fake/reset`, {});
  });
});

describe("#9 redirect targets are allowlisted", () => {
  it("allows relative paths and loopback hosts only", () => {
    expect(safeRedirectTarget("/billing/done?x=1")).toBe("/billing/done?x=1");
    expect(safeRedirectTarget("http://localhost:3100/cb")).toBe("http://localhost:3100/cb");
    expect(safeRedirectTarget("http://127.0.0.1/cb")).toBe("http://127.0.0.1/cb");
    expect(safeRedirectTarget("http://[::1]:3100/cb")).toBe("http://[::1]:3100/cb");
    for (const bad of ["", "https://evil.example/cb", "//evil.example/cb", "/\\evil.example", "javascript:alert(1)", "http://localhost.evil.example/cb", "http://user@evil.example/", "cb", "http://169.254.169.254/", // a relative path that normalises to a protocol-relative Location
      // the normalisation bypass Claude Sonnet 5.5 found (review): the raw string has a single leading slash,
      // but `new URL(raw, base)` collapses the dot segment and yields pathname "//evil.example".
      "/.//evil.example", "/..//evil.example", "/..//evil", "/a/../..//evil", "/%2e%2e//evil", "/././/evil"]) {
      expect(safeRedirectTarget(bad), bad).toBeNull();
    }
  });

  const authorize = (redirect: string) =>
    fetch(`${providers.url}/google_sheets/oauth/authorize?response_type=code&client_id=c&state=s&redirect_uri=${encodeURIComponent(redirect)}`, { redirect: "manual" });

  it("the OAuth authorize endpoint still redirects to a local callback with code and state", async () => {
    const res = await authorize("http://localhost/cb");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("http://localhost");
    expect(loc.searchParams.get("code")).toMatch(/^fake-code-/);
    expect(loc.searchParams.get("state")).toBe("s");
  });

  it("the OAuth authorize endpoint refuses an external redirect target", async () => {
    const res = await authorize("https://evil.example/cb");
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  it("the OIDC authorize endpoint refuses an external redirect target", async () => {
    const res = await fetch(`${providers.url}/zitadel/authorize?client_id=c&redirect_uri=${encodeURIComponent("https://evil.example/cb")}`, { redirect: "manual" });
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("#5 stack trace exposure: internal errors return a generic body", () => {
  it("answers 500 with a generic error and logs the stack server-side only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await postJson(`${providers.url}/__fake/oauth-client`, { provider: "github", clientId: "c", secrets: ["s"] });
      // A malformed percent-escape makes the handler throw (URIError).
      const res = await fetch(`${providers.url}/github/applications/%E0%A4%A/grant`, {
        method: "DELETE",
        headers: { authorization: `Basic ${Buffer.from("c:s").toString("base64")}`, "content-type": "application/json" },
        body: JSON.stringify({ access_token: "t" }),
      });
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: "internal fake server error" });
      expect(text).not.toMatch(/URIError|malformed|\bat \S+ \(|\.ts:\d+/i);
      expect(log.mock.calls.flat().join("\n")).toMatch(/URIError/);
    } finally {
      log.mockRestore();
      await postJson(`${providers.url}/__fake/reset`, {});
    }
  });
});

describe("#7 resource exhaustion: the fake AI server caps request bodies", () => {
  it("answers 413 for a body above the cap", async () => {
    const res = await fetch(`${ai.url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(2 * 1024 * 1024) }).catch((e: unknown) => e);
    // The server may close the socket while the client is still uploading; either outcome means the body was refused.
    if (res instanceof Response) expect(res.status).toBe(413);
    else expect(res).toBeInstanceOf(Error);
  });

  it("a slow fault still answers after its exact delay, clamped to the 10 s ceiling (timer alert)", async () => {
    await postJson(`${ai.url}/__fake/openai/fault`, { mode: "slow", times: 1, path: "models", delayMs: 100 });
    const t0 = Date.now();
    const res = await fetch(`${ai.url}/openai/v1/models`, { headers: { authorization: "Bearer sk-fake-test" } });
    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100); // the requested 100 ms, unchanged
  });

  it("slowDelayMs bounds the requested delay to [0, 10 s] with the CodeQL upper-bound guard (deterministic, no wall clock)", () => {
    expect(slowDelayMs(0)).toBe(0); // an explicit 0 stays 0, not the 1000 ms default
    expect(slowDelayMs(-5)).toBe(0);
    expect(slowDelayMs(undefined)).toBe(1000);
    expect(slowDelayMs("abc")).toBe(1000);
    expect(slowDelayMs(100)).toBe(100); // in-range values keep their exact timing
    expect(slowDelayMs(3000)).toBe(3000);
    expect(slowDelayMs(10_000)).toBe(10_000); // the ceiling itself is unchanged
    // Root cause of the CodeQL timer alert: the bound is a relational upper-bound guard, not Math.min,
    // so the value that reaches setTimeout is never user-controlled. Prove it stays in range for a sweep.
    for (let ms = -20_000; ms <= 20_000; ms += 250) {
      expect(slowDelayMs(ms)).toBeGreaterThanOrEqual(0);
      expect(slowDelayMs(ms)).toBeLessThanOrEqual(10_000);
    }
    expect(slowDelayMs(1e12)).toBe(10_000); // the timer is always bounded (CodeQL timer alert)
    expect(slowDelayMs(Number.POSITIVE_INFINITY)).toBe(1000); // non-finite falls back to the default
  });

  it("still answers a normal chat request", async () => {
    const res = await postJson(`${ai.url}/api/chat`, { model: "fake-model", messages: [{ role: "user", content: "Vendor: Acme\nTotal: 5" }] });
    expect(res.status).toBe(200);
  });
});

describe("#9 Paddle's success_url query parameter is allowlisted", () => {
  it("falls back to the checkout page for an external success_url and keeps a local one", async () => {
    const adapter = new PaddlePaymentAdapter("pdl_sdbx_fake_billing", "pdl_ntfset_fake");
    await postJson(`${providers.url}/__fake/paddle/price`, { id: "pri_test_cq", trialDays: 0 });
    const complete = async (success: string) => {
      const c = await adapter.createCustomer({ id: "ws-cq", name: "Cq", slug: "cq", email: "o@cq.test" });
      const s = await adapter.createCheckoutSession({ customerId: c.id, priceId: "pri_test_cq", successUrl: success, cancelUrl: "http://localhost:3100/c", checkoutPageUrl: "http://localhost:3100/billing/checkout?ws=cq" });
      return fetch(`${providers.url}/paddle/checkout/${s.id}/complete?success_url=${encodeURIComponent(success)}`, { method: "POST", redirect: "manual" });
    };
    const ext = await complete("https://evil.example/ok");
    expect(ext.status).toBe(303);
    expect(ext.headers.get("location")).toMatch(/^\/paddle\/checkout\/txn_/);
    const local = await complete("http://localhost:3100/ok");
    expect(local.headers.get("location")).toBe("http://localhost:3100/ok");
  });
});

describe("the triage notes stay in sync with the code (root cause of the $-loss review rounds)", () => {
  it("keep the $ anchor syntax in the doc and the JSDoc, and document the clamped timer", () => {
    const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
    const doc = read("../../docs/security/codeql-triage-fakes.md");
    const safety = read("../../e2e/fakes/safety.ts");
    expect(doc).toContain("optional trailing `$` (ends with)");
    expect(doc).toContain("`^/conversations\\.list$` still means that exact path");
    expect(safety).toContain("trailing `$` (path ends with)");
    expect(safety).toContain("`^/a\\.b$` still means");
    expect(doc).toContain("clamp"); // the #7 row describes the timer handling the code actually has
    expect(doc).toContain("upper-bound"); // …and names the guard that satisfies the CodeQL timer alert
    expect(safety).toContain("upper-bound");
  });
});
