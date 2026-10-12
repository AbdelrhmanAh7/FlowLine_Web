// Issue #109 (part 2 of #47): account deletion inserts its "account.deleted" audit row before it locks the user's
// workspaces FOR UPDATE. Request-level (no model): the person-visible result must not change. A member of a shared
// workspace confirms the deletion link from the test outbox; the deletion finishes ("done"), the account can no longer
// sign in, a forged token is refused, and the shared workspace's owner still sees one "account.deleted" audit event.
// The lock order itself (and the deadlock it avoids) is proven on real PostgreSQL connections in
// tests/integration/retained-file-locking.test.ts and tests/unit/email-token-lock-order.test.ts.
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
/** Deterministic per stack: derived from a fixed seed and the stack URL, never from the clock. */
const seeded = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("hex").slice(0, 12);
const plain = (base: string) => ({ "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED });

/** Polls the test-stack outbox for the newest link of one purpose and returns its token. */
async function outboxToken(base: string, email: string, purpose: string) {
  for (let i = 0; i < 24; i++) {
    const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: plain(base) });
    const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
    const link = messages.filter((m) => m.purpose === purpose).at(-1)?.link;
    const token = link ? new URL(link).searchParams.get("token") : null;
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 500)); // the outbox is written after the response
  }
  throw new Error(`no ${purpose} e-mail in the test outbox`);
}

const signIn = (base: string, email: string) =>
  fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ email, password: PASSWORD }) });

/** A verified, signed-in account through the product's own endpoints; returns request headers carrying its session. */
async function signedIn(base: string, email: string) {
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  if (up.ok) {
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ action: "verify", token: await outboxToken(base, email, "verify") }) });
    expect(v.status).toBe(200);
  }
  const res = await signIn(base, email);
  expect(res.status).toBe(200);
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { ...plain(base), cookie: `${FIXED}; ${session}` };
}

test(
  "@issue-109 AC: deleting an account in a shared workspace still finishes and leaves its account.deleted audit event",
  { tags: ["feat:fl-email-flows", "feat:fl-audit-log", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const ownerEmail = `army-109-owner-${seeded(base, "owner")}@flowline-e2e.test`;
    const memberEmail = `army-109-member-${seeded(base, "member")}@flowline-e2e.test`;
    const owner = await signedIn(base, ownerEmail);
    const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers: owner, body: JSON.stringify({ name: "Army 109" }) });
    expect(created.status).toBe(201);
    const { workspace } = (await created.json()) as { workspace: { id: string } };
    const invited = await fetch(`${base}/api/workspaces/${workspace.id}/invites`, { method: "POST", headers: owner, body: JSON.stringify({ email: memberEmail, role: "editor" }) });
    expect(invited.status).toBe(201);
    const inviteToken = new URL(((await invited.json()) as { url: string }).url).pathname.split("/").at(-1)!;

    const member = await signedIn(base, memberEmail);
    expect((await fetch(`${base}/api/invites/${inviteToken}`, { method: "POST", headers: member })).status).toBe(200);
    expect((await fetch(`${base}/api/email`, { method: "POST", headers: member, body: JSON.stringify({ action: "deleteRequest" }) })).status).toBe(200);
    const deleteToken = await outboxToken(base, memberEmail, "delete");

    // Invalid case: a well-formed token nobody issued is refused and deletes nothing.
    const forged = await fetch(`${base}/api/email`, { method: "POST", headers: member, body: JSON.stringify({ action: "deleteConfirm", token: createHash("sha256").update(`${base}|army-109-forged`).digest("base64url") }) });
    expect(await forged.json()).toMatchObject({ status: "invalid" });

    const confirmed = await fetch(`${base}/api/email`, { method: "POST", headers: member, body: JSON.stringify({ action: "deleteConfirm", token: deleteToken }) });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ status: "done" });
    expect((await signIn(base, memberEmail)).status).not.toBe(200);

    // The shared workspace survives with exactly one account.deleted record (written before the workspace lock).
    const log = await fetch(`${base}/api/workspaces/${workspace.id}/audit`, { headers: owner });
    expect(log.status).toBe(200);
    const actions = (((await log.json()).events ?? []) as { action: string }[]).map((e) => e.action);
    expect(actions.filter((a) => a === "account.deleted")).toHaveLength(1);
  },
);
