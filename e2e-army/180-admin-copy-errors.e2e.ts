// Issue #180: Improve client-side error display for /admin/copy
// Request-level test (no model): verifies /api/platform/copy refuses non-admins with a JSON error carrying a code.
// UI error states (loadError + Retry, meLoadError alert, save/publish error messages, refetch on conflict) are
// covered by unit tests in tests/unit/admin/copy/ because the test stack does not seed a platform admin and
// there is no test API to promote a user. Admin error paths (409 REVISION_CONFLICT, 403 STEP_UP_REQUIRED)
// are covered by the unit tests for copyErrorKey and shouldRefetchAfterWriteError.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
/** Deterministic per stack: derived from a fixed seed and the stack URL, never from the clock. */
const seeded = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("base64url");

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its session cookies. */
async function signedIn(base: string, email: string) {
  const h = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED };
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    let token: string | null = null;
    for (let i = 0; i < 24 && !token; i++) {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      if (!token) await new Promise((r) => setTimeout(r, 500)); // the outbox is written after the sign-up response
    }
    if (!token) throw new Error("no verification e-mail in the test outbox");
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    if (!v.ok) throw new Error(`verify ${v.status}`);
  }
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { "content-type": "application/json", origin: new URL(base).origin, cookie: `${FIXED}; ${session}` };
}

test(
  "@issue-180 AC: /api/platform/copy refuses a non-admin PATCH with 404 and a JSON error body carrying a code",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const user = await signedIn(base, `army-180-user-${seeded(base, "user").slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}@flowline-e2e.test`);
    // 404 is intentional (hides the panel): requirePlatformAdmin throws notFound() for non-admins before the body is
    // validated or a step-up is checked (src/server/platform-access.ts requirePlatformAdmin, src/server/platform-http.ts platformWrite);
    // route() serialises it as { error: { code: "NOT_FOUND", ... } } (src/server/http.ts).
    const res = await fetch(`${base}/api/platform/copy`, {
      method: "PATCH",
      headers: user,
      body: JSON.stringify({ action: "edit", edits: [], expectedRevision: 0 }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = JSON.parse(await res.text());
    expect(typeof json.error.code).toBe("string");
    // Verify no HTML or stack trace leaks in the error response
    const body = JSON.stringify(json);
    expect(body).not.toContain("<html");
    expect(body).not.toContain("stack trace");
  },
);

test(
  "@issue-180 AC: /admin/copy page returns 404 for a non-admin user (panel existence not confirmed)",
  { tags: ["feat:fl-platform-admin", "lvl:ui"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const user = await signedIn(base, `army-180-ui-${seeded(base, "ui").slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}@flowline-e2e.test`);
    // Non-admins should get a 404 page (not the copy editor) — the panel's existence is not confirmed
    // per src/server/platform-access.ts: "Everyone who isn't an active admin gets 404 — the panel's existence isn't confirmed."
    const res = await fetch(`${base}/admin/copy`, { headers: user });
    expect(res.status).toBe(404);
  },
);