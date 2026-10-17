import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { previewSignUp } from "@/server/beta";
import * as emailFlows from "@/server/email/flows";
import { acceptInvite, createInvite } from "@/server/members";
import { ssoProviderId } from "@/server/sso";
import { confirmSsoLink } from "@/server/sso-link";
import { createWorkspace } from "@/server/workspaces";
import { addMember, closeDb, expectHttpError } from "./helpers";
import { makeVerifiedUser, sessionFor } from "./platform-helpers";
import { configuredTenant, consumeMailboxLink, ISSUER, mockTenantIdp, oidcSignIn, proveSsoMailbox } from "./federation-fixture";

beforeEach(() => { mockTenantIdp(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(closeDb);
const accounts = (userId: string) => db.select().from(schema.account).where(eq(schema.account.userId, userId));

describe("H2: tenant email assertions never establish global mailbox ownership", () => {
  it("blocks pre-hijacking even when an undelivered invitation permits beta signup, then blocks the attacker after legitimate adoption", async () => {
    vi.stubEnv("FLOWLINE_BETA_MODE", "invite_only");
    const { owner, ws } = await configuredTenant();
    const email = `future-victim-${randomUUID()}@flowline-test.local`;
    const refused = vi.spyOn(emailFlows, "sendInviteEmail").mockRejectedValue(new Error("Synthetic mailbox delivery refusal"));
    const invitation = await createInvite(owner, ws.id, { email, role: "viewer" });
    expect(invitation.emailed).toBe(false);
    expect((await previewSignUp(email)).ok).toBe(true);
    await expectHttpError(oidcSignIn(ws.slug, email), 403, "SSO_EMAIL_OWNERSHIP_REQUIRED");
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(0);
    expect(await db.select().from(schema.account).where(and(eq(schema.account.providerId, ssoProviderId(ws.id, ISSUER, "test-client")), eq(schema.account.accountId, "attacker-subject")))).toHaveLength(0);
    refused.mockRestore();
    // The real owner creates/verifies a normal account through the real mail endpoint.
    const signup = await auth.api.signUpEmail({ body: { email, name: "Mailbox owner", password: "victim-password-123" } });
    expect(signup.token).toBeNull();
    await consumeMailboxLink(email);
    await emailFlows.issueAccountToken("reset", signup.user);
    await consumeMailboxLink(email, "/reset-password");
    const victim = (await auth.api.signInEmail({ body: { email, password: "recovered-password-123" } })).user;
    const legitimateOwner = await makeVerifiedUser("legitimate-owner");
    const legitimate = await createWorkspace(legitimateOwner, `Legitimate-${randomUUID().slice(0, 8)}`);
    const second = await createInvite(legitimateOwner, legitimate.id, { email, role: "editor" });
    expect(second.emailed).toBe(true);
    await acceptInvite(victim, second.url.split("/").at(-1)!);
    await expectHttpError(oidcSignIn(ws.slug, email), 409, "SSO_ACCOUNT_EXISTS");
    expect((await accounts(victim.id)).map((a) => a.providerId)).toEqual(["credential"]);
    expect(await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, legitimate.id), eq(schema.workspaceMember.userId, victim.id)))).toHaveLength(1);
  });

  it("quarantines historical unproven bindings; real mailbox password recovery removes them and revokes their sessions", async () => {
    const { ws } = await configuredTenant();
    const victim = await makeVerifiedUser("legacy-prehijacked"); // models the old incorrectly verified flag
    const legacyProvider = ssoProviderId(ws.id, ISSUER, "test-client").replace("sso:approved:", "sso:");
    await db.insert(schema.account).values({ id: randomUUID(), userId: victim.id, providerId: legacyProvider, accountId: "attacker-subject" });
    const stolen = await sessionFor(victim);
    await addMember(ws.id, victim.id, "viewer");
    await expectHttpError(oidcSignIn(ws.slug, victim.email), 409, "SSO_ACCOUNT_EXISTS");
    // Even the attacker's surviving pre-upgrade session cannot bless the old
    // emailVerified flag: a new proposal needs a real mailbox-bound token.
    const proposal = await oidcSignIn(ws.slug, victim.email, stolen);
    await expectHttpError(confirmSsoLink(proposal.linkRequired!, stolen.token, {}), 403, "SSO_EMAIL_OWNERSHIP_REQUIRED");
    await emailFlows.issueAccountToken("reset", victim);
    await consumeMailboxLink(victim.email, "/reset-password");
    expect(await db.select().from(schema.session).where(eq(schema.session.token, stolen.token))).toHaveLength(0);
    expect((await accounts(victim.id)).map((a) => a.providerId)).toEqual(["credential"]);
    const legitimate = await createWorkspace(await makeVerifiedUser("recovered-tenant"), `Recovered-${randomUUID().slice(0, 8)}`);
    await addMember(legitimate.id, victim.id, "editor");
    await expectHttpError(oidcSignIn(ws.slug, victim.email), 409, "SSO_ACCOUNT_EXISTS");
  });

  it("requires the exact proposal's real mailbox proof, and preserves confirmed methods on normal password recovery", async () => {
    const { ws } = await configuredTenant();
    const victim = await makeVerifiedUser("approved-owner");
    await addMember(ws.id, victim.id, "viewer");
    const session = await sessionFor(victim);
    // Unrelated historical verification does not approve a new tenant identity.
    await emailFlows.issueAccountToken("verify", victim);
    await consumeMailboxLink(victim.email);
    const proposal = await oidcSignIn(ws.slug, victim.email, session);
    await expectHttpError(confirmSsoLink(proposal.linkRequired!, session.token, {}), 403, "SSO_EMAIL_OWNERSHIP_REQUIRED");
    await proveSsoMailbox(proposal.linkRequired!, session);
    await confirmSsoLink(proposal.linkRequired!, session.token, {});
    expect((await oidcSignIn(ws.slug, victim.email)).user.id).toBe(victim.id);
    await emailFlows.issueAccountToken("reset", victim);
    await consumeMailboxLink(victim.email, "/reset-password");
    expect((await accounts(victim.id)).map((a) => a.providerId)).toContain(ssoProviderId(ws.id, ISSUER, "test-client"));
    expect((await oidcSignIn(ws.slug, victim.email)).user.id).toBe(victim.id);
  });
});
