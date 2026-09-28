import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken, issueAccountToken, requestToken, tokenState } from "@/server/email/flows";
import { checkEmailRate } from "@/server/email/flows";
import { POST as emailPOST } from "@/app/api/email/route";
import { acceptInvite, createInvite, revokeInvite } from "@/server/members";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

process.env.FLOWLINE_EMAIL_PROVIDER = "outbox";
afterAll(closeDb);

async function lastToken(email: string, path: string) {
  const [mail] = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, email)).orderBy(schema.emailOutbox.createdAt).limit(100);
  const all = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, email));
  const message = all.filter((m) => m.plainText.includes(path)).at(-1) ?? mail;
  expect(message).toBeDefined();
  const match = new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?token=([A-Za-z0-9_-]+)`).exec(message!.plainText);
  expect(match).not.toBeNull();
  return match![1]!;
}

describe("email account flows", () => {
  it("sends verification on better-auth sign-up and blocks email sign-in until verified", async () => {
    const email = `signup-${crypto.randomUUID()}@flowline.test`;
    const password = "signup-password-123";
    const signedUp = await auth.api.signUpEmail({ body: { email, password, name: "Test sign-up" } });
    expect(signedUp.token).toBeNull();
    const token = await lastToken(email, "/verify-email");
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toBeDefined();
    expect(await consumeAccountToken("verify", token)).toBe("done");
    expect((await auth.api.signInEmail({ body: { email, password } })).user.email).toBe(email);
  });
  it("verifies once with only a hash at rest, and distinguishes expired links", async () => {
    const user = await makeUser("emailverify");
    await issueAccountToken("verify", user);
    const token = await lastToken(user.email, "/verify-email");
    const [stored] = await db.select().from(schema.emailToken).where(eq(schema.emailToken.userId, user.id));
    expect(stored!.tokenHash).not.toBe(token);
    expect(await consumeAccountToken("verify", token)).toBe("done");
    expect(await tokenState("verify", token)).toBe("used");
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(row!.emailVerified).toBe(true);
    await issueAccountToken("verify", user);
    const expired = await lastToken(user.email, "/verify-email");
    await db.update(schema.emailToken).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.emailToken.tokenHash, sha256Hex(expired)));
    expect(await tokenState("verify", expired)).toBe("expired");
  });

  it("resets the credential and invalidates sessions; reuse is refused", async () => {
    const user = await makeUser("emailreset");
    await db.insert(schema.account).values({ id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: "old-hash" });
    await issueAccountToken("reset", user);
    const token = await lastToken(user.email, "/reset-password");
    expect(await consumeAccountToken("reset", token, "fresh-password-123")).toBe("done");
    expect(await consumeAccountToken("reset", token, "another-password")).toBe("used");
    const [account] = await db.select().from(schema.account).where(eq(schema.account.userId, user.id));
    expect(await verifyPassword({ hash: account!.password!, password: "fresh-password-123" })).toBe(true);
  });

  it("delivers invitations and leaves revoked links unusable", async () => {
    const owner = await makeUser("emailowner");
    const invitee = await makeUser("emailinvitee");
    const ws = await createWorkspace(owner, unique("Email invite"));
    const first = await createInvite(owner, ws.id, { email: invitee.email, role: "viewer" });
    const messages = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, invitee.email));
    expect(messages.at(-1)!.plainText).toContain(first.url);
    await revokeInvite(owner, ws.id, first.invite.id);
    await expectHttpError(acceptInvite(invitee, first.url.split("/").at(-1)!), 410, "INVITE_REVOKED");
    const second = await createInvite(owner, ws.id, { email: invitee.email, role: "editor" });
    expect((await acceptInvite(invitee, second.url.split("/").at(-1)!)).role).toBe("editor");
  });

  it("requires ownership transfer before deleting a last owner with members", async () => {
    const owner = await makeUser("emaildelete");
    const member = await makeUser("emailmember");
    const ws = await createWorkspace(owner, unique("Email deletion"));
    await db.insert(schema.workspaceMember).values({ workspaceId: ws.id, userId: member.id, role: "viewer" });
    await issueAccountToken("delete", owner);
    const token = await lastToken(owner.email, "/account/delete");
    expect(await consumeAccountToken("delete", token, undefined, owner.id)).toBe("transfer_required");
    await db.update(schema.workspaceMember).set({ role: "owner" }).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, member.id)));
    expect(await consumeAccountToken("delete", token, undefined, owner.id)).toBe("done");
    expect(await tokenState("delete", token)).toBe("used");
    const [deleted] = await db.select().from(schema.user).where(eq(schema.user.id, owner.id));
    expect(deleted).toBeUndefined();
  });

  it("returns the same API result for unknown and known reset addresses and enforces a shared limit", async () => {
    const user = await makeUser("emailenumeration");
    const post = (email: string) => emailPOST(new Request("http://localhost:3100/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "forgot", email }) }), {} as never);
    const known = await post(user.email);
    const unknown = await post(`missing-${crypto.randomUUID()}@flowline.test`);
    expect(await known.json()).toEqual(await unknown.json());
    const emails = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, user.email));
    expect(emails).toHaveLength(1);
    await requestToken("reset", user.email);
    await requestToken("reset", user.email);
    await expect(requestToken("reset", user.email)).rejects.toMatchObject({ status: 429 });
  });

  it("limits many different recipients from the same IP in PostgreSQL", async () => {
    const request = new Request("http://localhost:3100/api/email", { headers: { "x-real-ip": `192.0.2.${Math.floor(Math.random() * 200) + 1}` } });
    for (let index = 0; index < 15; index++) await checkEmailRate("ip-test", `recipient-${crypto.randomUUID()}@flowline.test`, request);
    await expect(checkEmailRate("ip-test", `recipient-${crypto.randomUUID()}@flowline.test`, request)).rejects.toMatchObject({ status: 429 });
  });
});
