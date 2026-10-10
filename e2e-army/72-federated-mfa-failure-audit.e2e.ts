// Issue #72: a failed or abandoned federated MFA step is audited with a bounded reason, and the audit never changes the
// refusal the user sees. Request-level (no model). A real federated challenge needs a configured IdP, which the throwaway
// stack does not have, so this checks what the stack can observe: a forged challenge cookie still gets the same 401 (the
// new expired-challenge cleanup and failure audit run on that path and must not mask it), writes no failure audit (no
// actor), and leaks nothing into the workspace audit or the platform audit. The audited reasons (invalid_code,
// replayed_code, expired, rate_limited) and the retention sweep of abandoned challenges are proven against PostgreSQL in
// tests/integration/sec-federated-mfa-regression.test.ts; no endpoint triggers the retention job.
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
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
    let token = null as string | null;
    // the outbox is written after the sign-up response: poll until the verify mail is there (bounded by the poll timeout, no fixed delay)
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token !== null;
    }, { timeout: 12_000, interval: 250, message: "no verification e-mail in the test outbox" }).toBe(true);
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
  "@issue-72 AC1/AC3: a refused federated MFA step keeps its 401 and puts no code, token or message into the audit",
  { tags: ["feat:fl-zitadel-federated-mfa", "feat:fl-audit-log", "feat:fl-platform-admin", "feat:fl-files", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // Well-formed (43 base64url characters) so it reaches the challenge lookup and the expired-challenge cleanup.
    const forged = seeded(base, "army-72-forged-challenge");
    expect(forged).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stepUp = { origin: new URL(base).origin, cookie: `${FIXED}; fl_federated_mfa=${forged}` };
    // Twice: the second attempt sees the same refusal, not a 500 from the cleanup or the audit write.
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/api/federation/step-up`, { headers: stepUp });
      const text = await res.text();
      expect(res.status).toBe(401);
      expect(JSON.parse(text).error.code).toBe("FEDERATED_MFA_INVALID");
      expect(text).not.toContain(forged);
    }

    const owner = await signedIn(base, `army-72-${seeded(base, "owner").slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}@flowline-e2e.test`);
    const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers: owner, body: JSON.stringify({ name: "Army 72" }) });
    expect(created.status).toBeLessThan(300);
    const { workspace } = (await created.json()) as { workspace: { id: string } };
    const log = await fetch(`${base}/api/workspaces/${workspace.id}/audit`, { headers: owner });
    expect(log.status).toBe(200);
    const logText = await log.text();
    const actions = ((JSON.parse(logText).events ?? []) as { action: string }[]).map((e) => e.action);
    // A challenge nobody owns has no actor, so it is not audited against this (or any) workspace.
    expect(actions).not.toContain("sso.mfa_failed");
    expect(logText).not.toContain(forged);
    // The platform audit, where global-provider failures go (signin.mfa_failed), stays closed to an ordinary user.
    expect((await fetch(`${base}/api/platform/audit`, { headers: owner })).status).toBe(404);
  },
);
