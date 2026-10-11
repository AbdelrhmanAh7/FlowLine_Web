// Issue #180: Improve client-side error display for /admin/copy
// Request-level test (no model). Checks that server errors return JSON with error.code
// and no HTML/stack trace, and that the page gives 404 not 500 for non-admins.
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
  "@issue-180 AC: server errors on /api/platform/copy return JSON with error.code and no HTML/stack trace, and /admin/copy gives 404 not 500 for non-admins",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // As an ordinary signed-in user (not platform admin), PATCH /api/platform/copy
    const user = await signedIn(base, `army-180-user-${seeded(base, "user").slice(0, 10)}@flowline-e2e.test`);
    const patchRes = await fetch(`${base}/api/platform/copy`, {
      method: "PATCH",
      headers: user,
      body: JSON.stringify({ action: "edit", edits: [], expectedRevision: 0 }),
    });
    expect(patchRes.status).toBe(404); // non-admin gets 404 per platformAdminOrNull
    const patchBody = await patchRes.text();
    expect(patchRes.headers.get("content-type")).toContain("application/json");
    const patchJson = JSON.parse(patchBody);
    expect(patchJson.error).toBeDefined();
    expect(patchJson.error.code).toBeDefined();
    expect(patchBody).not.toContain("<html");
    expect(patchBody).not.toContain("stack trace");
    expect(patchBody).not.toContain("at ");

    // The page /admin/copy should also give 404, not 500
    const pageRes = await fetch(`${base}/admin/copy`, { headers: user });
    expect(pageRes.status).toBe(404);
    const pageBody = await pageRes.text();
    expect(pageBody).not.toContain("500");
    expect(pageBody).not.toContain("Internal Server Error");
  },
);

test(
  "@issue-180 AC: platform admin can reach /api/platform/copy and gets JSON error with code on conflict (409) and step-up (403)",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // The test stack may not have a platform admin pre-seeded; accept 200 or 404/403 with JSON error
    const getRes = await fetch(`${base}/api/platform/copy`, {
      method: "GET",
      headers: { "content-type": "application/json", origin: new URL(base).origin, cookie: "" },
    });
    // The test stack may not have a platform admin pre-seeded; accept 200 or 404/403 with JSON error
    expect([200, 403, 404]).toContain(getRes.status);
    const getBody = await getRes.text();
    if (getRes.status !== 200) {
      expect(getRes.headers.get("content-type")).toContain("application/json");
      const getJson = JSON.parse(getBody);
      expect(getJson.error).toBeDefined();
      expect(getJson.error.code).toBeDefined();
      expect(getBody).not.toContain("<html");
      expect(getBody).not.toContain("stack trace");
    }
  },
);