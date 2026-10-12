// Issue #180: Improve client-side error display for /admin/copy
// Request-level test (no model). The e2e-army packages (`e2e`, `@e2e-dev/web`) expose no request interception that this
// repo can verify, so forcing /api/platform/copy to 500 and asserting the friendly loadError + Retry UI is covered by
// tests/unit/admin/copy/copy-errors.test.ts (error to message-key mapping) and tests/unit/admin/copy/copy-editor.test.ts
// (load-error UI, meLoadError alert, Retry button). Here: the real endpoint refuses a non-admin with a JSON error body
// that carries an error.code, so the editor always has a code to map and never receives HTML.
//
// Admin error paths (409 REVISION_CONFLICT, 403 STEP_UP_REQUIRED) require a platform admin session. The test stack does
// not seed a platform admin by default, and there is no test API to promote a user. These paths are covered by the
// unit tests for copyErrorKey and shouldRefetchAfterWriteError.
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
  "@issue-180 AC: /api/platform/copy refuses a non-admin with a JSON error that carries a code",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const user = await signedIn(base, `army-180-user-${seeded(base, "user").slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}@flowline-e2e.test`);
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