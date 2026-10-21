// Issues #200, #179, and #180: the error/rejection boundary of route(), /admin/copy, and of GET /api/platform/copy. Request-level (no model).
//
// #200 AC: route() error responses carry Cache-Control: no-store and Referrer-Policy: no-referrer.
// #179 AC1: GET /api/platform/copy (getCopyEditorState) never leaks state or an internal error to a non-admin caller.
// #180 AC: /admin/copy hides the panel with 404 for non-admins, and unauthorized mutations return clean NOT_FOUND JSON without stack traces.
// Detailed error display and recovery states are proven in tests/unit/admin/copy/copy-editor.test.ts.
// All tests hit the platform-admin endpoints and share the feat:fl-platform-admin tag.
//
// Merged into one file to stay within the hub's cap of 8 top-level e2e-army/*.e2e.ts files: the hub's
// verify job copies readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8) (nql-agents src/lib/e2earmy.ts) and
// the #166 MENA-template test is the eighth file, so tests/unit/e2e-army-tooling.test.ts asserts the repo stays at <= 8.
// Merging keeps every test and tag, with no extra session setup.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
/** JSON request headers for the stack; the test stack's open-beta cookie comes first, then the given cookies. */
const headers = (base: string, ...cookies: string[]) => ({
  "content-type": "application/json",
  origin: new URL(base).origin,
  cookie: ["fl_test_beta_mode=open", ...cookies].join("; "),
});

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its session cookies. */
async function signedIn(base: string, email: string) {
  const h = headers(base, "fl_locale=en");
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    // Poll (no fixed sleep) until the verification mail lands in the test outbox — the sign-up response can precede it.
    let token: string | null = null;
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token;
    }, { timeout: 15_000 }).not.toBeNull();
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    if (!v.ok) throw new Error(`verify ${v.status}`);
  }
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

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

test(
  "@issue-180 AC: /admin/copy hides the panel with 404 for non-admins and unauthorized mutations return clean NOT_FOUND JSON without stack traces",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // 1. /admin/copy returns 404 for anonymous visitors (platformAdminOrNull gate enforced)
    const anonPage = await fetch(`${base}/admin/copy`);
    expect(anonPage.status).toBe(404);

    // 2. /admin/copy returns 404 for a signed-in non-admin account (gate enforced by platformAdminOrNull)
    const session = await signedIn(base, `army-180-nonadmin-${createHash("sha256").update(base).digest("hex").slice(0, 12)}@flowline-e2e.test`);
    const nonAdminPage = await fetch(`${base}/admin/copy`, { headers: headers(base, "fl_locale=en", session) });
    expect(nonAdminPage.status).toBe(404);

    // 3. Unauthorized API mutations return 404 JSON NOT_FOUND without stack traces (uses non-admin session)
    const res = await fetch(`${base}/api/platform/copy`, {
      method: "PATCH",
      headers: headers(base, "fl_locale=en", session),
      body: JSON.stringify({ action: "edit", edits: [], expectedRevision: 0 }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = JSON.parse(await res.text());
    expect(json.error.code).toBe("NOT_FOUND");
    expect(json.error).not.toHaveProperty("stack");
    expect(typeof json.error.message).toBe("string");
    expect(json.error.message).not.toMatch(/\n\s+at \S+/);
  },
);
