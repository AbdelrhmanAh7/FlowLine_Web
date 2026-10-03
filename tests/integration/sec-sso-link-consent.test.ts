import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { GET as callback } from "@/app/api/sso/callback/route";
import { POST as confirm } from "@/app/api/sso/link/route";
import { confirmationCsrf } from "@/server/auth-confirmation";
import { completeSso, ssoProviderId } from "@/server/sso";
import * as egress from "@/server/egress";
import { confirmSsoLink, SSO_LINK_COOKIE } from "@/server/sso-link";
import { createWorkspace } from "@/server/workspaces";
import { addMember, closeDb, expectHttpError } from "./helpers";
import { makeVerifiedUser, ORIGIN, sessionFor } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt, oidcSignIn, proveSsoMailbox } from "./federation-fixture";

beforeEach(() => { mockTenantIdp(); });
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);
const links = (userId: string) => db.select().from(schema.account).where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, ssoProviderId(workspaceId, ISSUER, "test-client"))));
let workspaceId = "";

describe("H1: a signed-in browser does not consent to account linking", () => {
  it("valid OIDC from an unrelated tenant GET grants no link/session; only explicit CSRF POST confirmation does", async () => {
    const { ws } = await configuredTenant(); workspaceId = ws.id;
    const victim = await makeVerifiedUser("victim");
    const legitimate = await createWorkspace(victim, `Legitimate-${randomUUID().slice(0, 8)}`);
    const session = await sessionFor(victim);
    // A malicious unrelated tenant cannot even propose a link to a non-member.
    await expectHttpError(oidcSignIn(ws.slug, victim.email, session), 404, "NOT_FOUND");
    expect(await links(victim.id)).toHaveLength(0);
    await addMember(ws.id, victim.id, "viewer");
    const attempt = await oidcAttempt(ws.slug, victim.email, session);
    const sessionsBefore = await db.select().from(schema.session).where(eq(schema.session.userId, victim.id));
    const response = await callback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `${session.cookie}; fl_sso_state=${attempt.state}`, "sec-fetch-site": "cross-site" } }));
    expect(response.headers.get("location")).toContain("/sso/link");
    expect(response.headers.get("set-cookie")).not.toContain("session_token");
    expect(await links(victim.id)).toHaveLength(0);
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, victim.id))).toHaveLength(sessionsBefore.length);
    const pendingCookie = response.headers.getSetCookie().find((c) => c.startsWith(`${SSO_LINK_COOKIE}=`))!.split(";")[0];
    const request = (origin: string, csrf?: string, approved = true) => new Request(`${ORIGIN}/api/sso/link`, { method: "POST", headers: { cookie: `${session.cookie}; ${pendingCookie}`, origin, "content-type": "application/json", ...(csrf ? { "x-flowline-csrf": csrf } : {}) }, body: JSON.stringify({ confirm: approved }) });
    expect((await confirm(request("https://attacker.example"), undefined)).status).toBe(403);
    expect((await confirm(request(ORIGIN), undefined)).status).toBe(403);
    const csrf = await confirmationCsrf(session.token);
    expect((await confirm(request(ORIGIN, csrf, false), undefined)).status).toBe(400);
    expect(await links(victim.id)).toHaveLength(0);
    const pendingToken = pendingCookie!.slice(SSO_LINK_COOKIE.length + 1);
    await proveSsoMailbox(pendingToken, session);
    expect((await confirm(request(ORIGIN, csrf), undefined)).status).toBe(200);
    expect(await links(victim.id)).toHaveLength(1);
    const next = await oidcSignIn(ws.slug, victim.email);
    expect(next.user.id).toBe(victim.id);
    expect((await auth.$context).internalAdapter.findUserById(victim.id)).toBeTruthy();
    expect(await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, legitimate.id), eq(schema.workspaceMember.userId, victim.id)))).toHaveLength(1);
  });

  for (const mutation of ["logout", "revoke", "replace-config"] as const) it(`refuses confirmation after ${mutation}`, async () => {
    const { ws } = await configuredTenant(); workspaceId = ws.id;
    const victim = await makeVerifiedUser(mutation);
    await addMember(ws.id, victim.id, "viewer");
    const session = await sessionFor(victim);
    const proposal = await oidcSignIn(ws.slug, victim.email, session);
    expect(proposal.linkRequired).toBeTruthy();
    await proveSsoMailbox(proposal.linkRequired!, session);
    if (mutation === "replace-config") await db.update(schema.ssoConfig).set({ issuer: "https://replacement.example", updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.ssoConfig.workspaceId, ws.id));
    else await db.delete(schema.session).where(eq(schema.session.token, session.token));
    await expectHttpError(confirmSsoLink(proposal.linkRequired!, mutation === "logout" ? "" : session.token, {}), 403, "SSO_LINK_INVALID");
    expect(await links(victim.id)).toHaveLength(0);
    await expectHttpError(oidcSignIn(ws.slug, victim.email), 409, "SSO_ACCOUNT_EXISTS");
  });

  it("rechecks the initiating session at the callback, including another signed-in session", async () => {
    const { ws } = await configuredTenant(); workspaceId = ws.id;
    const victim = await makeVerifiedUser("revoked-callback");
    await addMember(ws.id, victim.id, "viewer");
    const session = await sessionFor(victim);
    const attempt = await oidcAttempt(ws.slug, victim.email, session);
    const other = await sessionFor(victim);
    await expectHttpError(completeSso({ ...attempt, sessionToken: other.token }), 403, "SSO_LINK_INVALID");
    const revoked = await oidcAttempt(ws.slug, victim.email, session);
    await db.delete(schema.session).where(eq(schema.session.token, session.token));
    await expectHttpError(completeSso(revoked), 403, "SSO_LINK_INVALID");
    expect(await links(victim.id)).toHaveLength(0);
  });

  for (const mutation of ["replace-config", "disable-config", "remove-member", "remove-link", "revoke-email"] as const)
    it(`refuses an approved linked login if ${mutation} occurs during OIDC network work, and removes the unissued session`, async () => {
      const { ws } = await configuredTenant(); workspaceId = ws.id;
      const victim = await makeVerifiedUser(`mid-oidc-${mutation}`);
      await addMember(ws.id, victim.id, "viewer");
      const session = await sessionFor(victim);
      const proposal = await oidcSignIn(ws.slug, victim.email, session);
      await proveSsoMailbox(proposal.linkRequired!, session);
      await confirmSsoLink(proposal.linkRequired!, session.token, {});
      const attempt = await oidcAttempt(ws.slug, victim.email);
      const before = await db.select().from(schema.session).where(eq(schema.session.userId, victim.id));
      const provider = vi.mocked(egress.safeFetch);
      const original = provider.getMockImplementation()!;
      provider.mockImplementation(async (url, opts) => {
        const response = await original(url, opts);
        if (new URL(String(url)).pathname === "/jwks") {
          if (mutation === "replace-config") await db.update(schema.ssoConfig).set({ issuer: "https://replacement.example", updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.ssoConfig.workspaceId, ws.id));
          if (mutation === "disable-config") await db.update(schema.ssoConfig).set({ enabled: false, updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.ssoConfig.workspaceId, ws.id));
          if (mutation === "remove-member") await db.delete(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, victim.id)));
          if (mutation === "remove-link") await db.delete(schema.account).where(and(eq(schema.account.userId, victim.id), eq(schema.account.providerId, ssoProviderId(ws.id, ISSUER, "test-client"))));
          if (mutation === "revoke-email") await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, victim.id));
        }
        return response;
      });
      // Removing the account before its first lookup can take the unlinked path;
      // it must still refuse a session rather than rebuilding identity by email.
      const [status, code] = mutation === "replace-config" || mutation === "disable-config" ? [400, "SSO_STATE_INVALID"]
        : mutation === "remove-link" ? [409, "SSO_ACCOUNT_EXISTS"]
        : mutation === "revoke-email" ? [403, "SSO_EMAIL_OWNERSHIP_REQUIRED"] : [403, "SSO_LINK_INVALID"];
      await expectHttpError(completeSso(attempt), status as number, code as string);
      expect(await db.select().from(schema.session).where(eq(schema.session.userId, victim.id))).toEqual(before);
      if (mutation === "remove-member") expect(await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, victim.id)))).toHaveLength(0);
    });
});
