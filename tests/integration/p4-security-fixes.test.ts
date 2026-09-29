/**
 * Phase 4 — regressions for the Fable security review (artifacts/phase-4/fable-security/REVIEW.md).
 */
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { POST as billingWebhook } from "@/app/api/billing/webhook/route";
import { consumeAccountToken, issueAccountToken, tokenState } from "@/server/email/flows";
import { acceptInvite, createInvite } from "@/server/members";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";
import { seedSetting, unseedSetting } from "../fixtures/platform-seed";


process.env.FLOWLINE_EMAIL_PROVIDER = "outbox";
afterAll(closeDb);

async function tokens(email: string, path: string) {
  const all = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, email)).orderBy(schema.emailOutbox.createdAt);
  return all.map((m) => new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(m.plainText)?.[1]).filter((t): t is string => !!t);
}

describe("Fable review fixes", () => {
  it("a password reset consumes every other open reset link of that account", async () => {
    const user = await makeUser("resetall");
    await issueAccountToken("reset", user);
    await issueAccountToken("reset", user);
    const [first, second] = await tokens(user.email, "/reset-password");
    expect(first && second && first !== second).toBe(true);
    expect(await consumeAccountToken("reset", second!, "brand-new-password-1")).toBe("done");
    expect(await tokenState("reset", first!)).toBe("used");
    expect(await consumeAccountToken("reset", first!, "attacker-password-1")).toBe("used");
  });

  it("account deletion refuses (and deletes nothing) while a sole-member workspace has an uncancellable subscription", async () => {
    const owner = await makeUser("delsub");
    const ws = await createWorkspace(owner, unique("Billed"));
    await db.insert(schema.billingAccount).values({ workspaceId: ws.id, provider: "paddle", customerId: `ctm_${crypto.randomUUID()}`, subscriptionId: "sub_live_thing", status: "active" });
    await issueAccountToken("delete", owner);
    const [token] = await tokens(owner.email, "/account/delete");
    // No provider accepts the cancellation here (no adapter, or its provider is unreachable) → refused either way.
    await expect(consumeAccountToken("delete", token!, undefined, owner.id)).rejects.toMatchObject({ code: "BILLING_CANCEL_FAILED" });
    expect((await db.select().from(schema.user).where(eq(schema.user.id, owner.id))).length).toBe(1);
    expect((await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws.id))).length).toBe(1);
    expect(await tokenState("delete", token!)).toBe("valid");
    // A cancelled subscription no longer blocks deletion.
    await db.update(schema.billingAccount).set({ status: "canceled" }).where(eq(schema.billingAccount.workspaceId, ws.id));
    expect(await consumeAccountToken("delete", token!, undefined, owner.id)).toBe("done");
    expect((await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws.id))).length).toBe(0);
  });

  it("two co-owners deleting their accounts at the same time can't leave members in an ownerless workspace (Codex CX4-02)", async () => {
    const a = await makeUser("coowner-a");
    const b = await makeUser("coowner-b");
    const c = await makeUser("coviewer");
    const ws = await createWorkspace(a, unique("Co-owned"));
    await db.insert(schema.workspaceMember).values([
      { workspaceId: ws.id, userId: b.id, role: "owner" },
      { workspaceId: ws.id, userId: c.id, role: "viewer" },
    ]);
    await issueAccountToken("delete", a);
    await issueAccountToken("delete", b);
    const [ta] = await tokens(a.email, "/account/delete");
    const [tb] = await tokens(b.email, "/account/delete");
    const results = await Promise.all([consumeAccountToken("delete", ta!, undefined, a.id), consumeAccountToken("delete", tb!, undefined, b.id)]);
    expect(results.sort()).toEqual(["done", "transfer_required"]);
    const owners = await db.select().from(schema.workspaceMember).where(eq(schema.workspaceMember.workspaceId, ws.id));
    expect(owners.filter((m) => m.role === "owner")).toHaveLength(1);
  });

  it("an invitee outside the beta email sandbox still gets a usable invite; the owner is told it wasn't emailed", async () => {
    const owner = await makeUser("sandboxowner");
    const invitee = await makeUser("sandboxinvitee");
    const ws = await createWorkspace(owner, unique("Sandboxed"));
    // The recipient allowlist is a platform-panel setting now (owner decision 3), read per send.
    await seedSetting("email.allowed_recipients", ["only-this@allowed.test"]);
    try {
      const r = await createInvite(owner, ws.id, { email: invitee.email, role: "viewer" });
      expect(r.emailed).toBe(false);
      expect((await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, invitee.email))).length).toBe(0);
      expect((await acceptInvite(invitee, r.url.split("/").at(-1)!)).role).toBe("viewer");
    } finally {
      await unseedSetting("email.allowed_recipients");
    }
    const r2 = await createInvite(owner, ws.id, { email: `other-${crypto.randomUUID()}@flowline.test`, role: "viewer" });
    expect(r2.emailed).toBe(true);
  });

  it("billing webhook caps a chunked body without Content-Length at 256 KB (413, not buffered whole)", async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 64) return controller.close(); // 4 MB offered in total
        sent++;
        controller.enqueue(chunk);
      },
    });
    const req = new Request("http://localhost:3100/api/billing/webhook", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    const res = await billingWebhook(req, {} as never);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(10); // stopped reading shortly after the limit
  });
});
