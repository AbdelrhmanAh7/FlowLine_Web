// Issues #200, #179 and #323 (supersedes #181): the error/rejection boundary of route() and of /api/platform/copy and /admin/copy. No model: request-level, and AC6 also checks the rendered 404 page in the browser.
//
// #200 AC: route() error responses carry Cache-Control: no-store and Referrer-Policy: no-referrer.
// #179 AC1: GET /api/platform/copy (getCopyEditorState) never leaks state or an internal error to a non-admin caller.
// #323 AC1/AC6 (part 3/3 of #119, fresh restart of #181): every refusal of /api/platform/copy reaches the client as a bounded JSON error, and
// /admin/copy shows a non-admin the localized 404 page. The throwaway stack has no platform admin (one needs an enrolled
// authenticator, a session MFA proof and an admin row, which no endpoint creates), so this covers what the stack can observe;
// the admin-only refusals (STEP_UP_REQUIRED, CSRF_TOKEN_INVALID, UNSUPPORTED_MEDIA_TYPE, BODY_TOO_LARGE, VALIDATION,
// REVISION_CONFLICT, INTERNAL) and how the client's api() turns each into an ApiError are proven in
// tests/unit/admin-copy-errors.test.ts and tests/contract/errors.test.ts.
//
// AC4/AC5 (UI-level error handling in the copy editor) is covered by e2e/admin-panel.spec.ts in a real browser with the
// Playwright stack's platform admin, because this throwaway stack has no platform admin.
//
// The tests live in one file to stay within the hub's cap of 8 top-level e2e-army/*.e2e.ts files: the hub's verify job
// copies readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8) (nql-agents src/lib/e2earmy.ts), and
// tests/unit/e2e-army-tooling.test.ts asserts the repo stays at <= 8. Every test and tag is kept; copied files may import only
// `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
import { createHash } from "node:crypto";
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

test("@issue-179 AC1: an anonymous caller gets 404 and no copy state", { tags: ["feat:fl-platform-admin", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(new URL("/api/platform/copy", app.baseUrl));
  expect(res.status).toBe(404);
  const text = await res.text();
  expect(text).not.toContain("draft");
  expect(text).not.toContain("published");
});

const PASSWORD = "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
/** Deterministic per stack: derived from a fixed seed and the stack URL, never from the clock. */
const seeded = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("base64url");
const emailFor = (base: string, seed: string) => `army-323-${seeded(base, seed).slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}@flowline-e2e.test`;

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its session cookies. */
async function signedIn(base: string, email: string) {
  const h = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED };
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    let token: string | null = null;
    // The outbox is written after the sign-up response, so poll it (no fixed delay).
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token;
    }, { timeout: 12_000 }).toBeTruthy();
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    expect(v.status).toBe(200);
  }
  const inRes = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(inRes.status).toBe(200);
  const setCookies = inRes.headers.getSetCookie?.() ?? [inRes.headers.get("set-cookie") ?? ""].filter(Boolean);
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

/** Assert a response is JSON-bounded error: correct status, code, string message, only error/requestId keys, and never echoes input. */
async function expectBoundedError(res: Response, status: number, code: string, mustNotEcho: string[] = []) {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")?.toLowerCase()).toContain("application/json");
  const text = await res.text();
  let body: { error?: { code?: unknown; message?: unknown } } = {};
  expect(() => {
    body = JSON.parse(text);
  }).not.toThrow();
  expect(typeof body).toBe("object");
  expect(body).not.toBeNull();
  expect(Object.keys(body).sort()).toEqual(Object.keys(body).includes("requestId") ? ["error", "requestId"] : ["error"]);
  expect(body.error).toBeDefined();
  expect(typeof body.error).toBe("object");
  expect(body.error?.code).toBe(code);
  expect(typeof body.error?.message).toBe("string");
  expect(text).not.toContain("<html");
  for (const s of mustNotEcho) expect(text).not.toContain(s);
}

test(
  "@issue-323 AC1: every refusal of /api/platform/copy reaches the client as a bounded JSON error (never 500, HTML, a stack or an echo)",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const origin = new URL(base).origin;
    const url = `${base}/api/platform/copy`;
    const marker = `army-323-${seeded(base, "marker").slice(0, 12)}`;
    const edit = JSON.stringify({ action: "edit", edits: [{ locale: "en", key: "meta.title", value: marker }], expectedRevision: 0 });
    const publish = JSON.stringify({ action: "publish", expectedDraftRevision: 0, expectedPublishedRevision: 0 });

    // Signed out: the panel does not exist (404), for reads and writes alike.
    await expectBoundedError(await fetch(url, { headers: { cookie: FIXED } }), 404, "NOT_FOUND");
    await expectBoundedError(await fetch(url, { method: "PATCH", headers: { "content-type": "application/json", origin }, body: edit }), 404, "NOT_FOUND", [marker]);

    // Signed in, but not a platform admin: still 404 for GET, PATCH (edit) and POST (publish).
    const session = await signedIn(base, emailFor(base, "user"));
    const user = { "content-type": "application/json", origin, cookie: `${FIXED}; ${session}` };
    await expectBoundedError(await fetch(url, { headers: user }), 404, "NOT_FOUND");
    await expectBoundedError(await fetch(url, { method: "PATCH", headers: user, body: edit }), 404, "NOT_FOUND", [marker]);
    await expectBoundedError(await fetch(url, { method: "POST", headers: user, body: publish }), 404, "NOT_FOUND");

    // Malformed JSON is never parsed for a non-admin: a 404, not a 400 or a 500.
    await expectBoundedError(await fetch(url, { method: "PATCH", headers: user, body: `{"action":"edit",${marker}` }), 404, "NOT_FOUND", [marker]);

    // An API key (Bearer) never reaches the panel, even with a valid session cookie.
    await expectBoundedError(await fetch(url, { headers: { ...user, authorization: `Bearer ${marker}` } }), 404, "NOT_FOUND", [marker]);

    // A cross-site write with the session cookie is refused before anything else runs.
    const crossSite = { ...user, origin: "https://army-323.invalid", "sec-fetch-site": "cross-site" };
    await expectBoundedError(await fetch(url, { method: "POST", headers: crossSite, body: publish }), 403, "CROSS_SITE_REQUEST");
  },
);

test(
  "@issue-323 AC6: /admin/copy shows a non-admin the localized 404 page (Arabic RTL and English), never a server error",
  { tags: ["feat:fl-platform-admin", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const session = await signedIn(base, emailFor(base, "page"));
    const ar = await fetch(`${base}/admin/copy`, { headers: { cookie: `fl_test_beta_mode=open; fl_locale=ar; ${session}` } });
    expect(ar.status).toBe(404);
    const arHtml = await ar.text();
    expect(arHtml).toContain("لم نعثر على هذه الصفحة");
    expect(arHtml).not.toContain("platformAdmin.copyEditor");

    const en = await fetch(`${base}/admin/copy`, { headers: { cookie: `${FIXED}; ${session}` } });
    expect(en.status).toBe(404);
    const enHtml = await en.text();
    expect(enHtml).toContain("find that page");
    expect(enHtml).not.toContain("platformAdmin.copyEditor");

    // Language and direction are checked on the rendered page. Next 16 answers every thrown notFound() (/admin, the workspace
    // layout and /billing/checkout too) with its error shell, <html id="__next_error__"> without lang or dir, and the browser
    // renders the root layout and the 404 page from the payload, so the raw HTML never carries them.
    const cookies = session.split("; ").map((pair) => ({ url: base, name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1) }));
    const pages = [
      { locale: "ar", dir: "rtl", notFound: "لم نعثر على هذه الصفحة", editor: "تحرير النصوص" },
      { locale: "en", dir: "ltr", notFound: "We couldn't find that page", editor: "Copy editor" },
    ];
    for (const p of pages) {
      await browser.setCookies([...cookies, { url: base, name: "fl_test_beta_mode", value: "open" }, { url: base, name: "fl_locale", value: p.locale }]);
      await app.open("/admin/copy");
      await expect(screen.getByRole("heading", p.notFound)).toBeVisible();
      await expect(browser.locator("html")).toHaveAttribute("lang", p.locale);
      await expect(browser.locator("html")).toHaveAttribute("dir", p.dir);
      await expect(screen.getByRole("heading", p.editor)).toHaveCount(0);
      expect(await browser.url()).toMatch(/\/admin\/copy$/);
    }
  },
);

