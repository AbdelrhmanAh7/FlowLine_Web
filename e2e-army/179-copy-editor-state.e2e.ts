// Issue #179: GET /api/platform/copy (getCopyEditorState) never leaks state or an internal error to a caller who is not a
// platform admin. Request-level (no model). The admin success shape and the 503 COPY_STATE_UNAVAILABLE failure mapping are
// proven in tests/unit/platform-copy-state.test.ts (the throwaway stack has no platform admin / TOTP).
//
// Issue #180: Client-side error display for /admin/copy (Refs #119 part 2/3). When server errors occur, the UI displays
// appropriate error messages without breaking. Non-admins receive 404 on /admin/copy (the platform-admin boundary is enforced,
// panel is hidden), and unauthorized mutations return 404 JSON NOT_FOUND without stack traces. Detailed error display and recovery
// states are proven in tests/unit/admin/copy/copy-editor.test.ts (16 happy-dom interaction tests).
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

test("@issue-179 AC1: an anonymous caller gets 404 and no copy state", { tags: ["feat:fl-platform-admin", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(new URL("/api/platform/copy", app.baseUrl));
  expect(res.status).toBe(404);
  const text = await res.text();
  expect(text).not.toContain("draft");
  expect(text).not.toContain("published");
});

test(
  "@issue-180 AC: /admin/copy hides the panel with 404 for non-admins and unauthorized mutations return clean NOT_FOUND JSON without stack traces",
  { tags: ["feat:fl-platform-admin", "feat:fl-i18n-rtl", "lvl:api"] },
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
