import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => { throw new Error("No Next request context in service integration tests"); } }));
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { GET as ssoCallback } from "@/app/api/sso/callback/route";
import { GET as challengeGET, POST as challengePOST } from "@/app/api/federation/step-up/route";
import { confirmationCsrf } from "@/server/auth-confirmation";
import { sha256Hex } from "@/server/crypto";
import { FEDERATED_MFA_COOKIE } from "@/server/federated-mfa";
import { ssoProviderId, ssoSessionCookie } from "@/server/sso";
import { addMember, closeDb } from "./helpers";
import { code, enrolTotp, makeVerifiedUser, ORIGIN } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt } from "./federation-fixture";
import { githubCallback, githubCallbackRequest } from "./zitadel-callback-fixture";

/**
 * Issue #66: regression lock for the H3 federated MFA fix (docs/security/FEDERATED_MFA.md). Every case drives the real
 * callback routes with in-memory IdPs (no network, no credentials) and asserts on what a browser would get: the redirect,
 * the cookies and the session rows. Removing the MFA branch from either federated path makes the AC1, AC3 and AC4 cases fail.
 */
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(closeDb);

const sessionRows = (userId: string) => db.select().from(schema.session).where(eq(schema.session.userId, userId));
const signInAudits = (workspaceId: string, userId: string) => db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, workspaceId), eq(schema.auditEvent.action, "sso.signin"), eq(schema.auditEvent.targetId, userId)));
const sessionCookieName = async () => (await auth.$context).authCookies.sessionToken.name;
function cookieFrom(res: Response, name: string) {
  return res.headers.getSetCookie().filter((c) => c.startsWith(`${name}=`) && !/Max-Age=0/.test(c)).at(-1)?.split(";")[0] ?? "";
}
const pendingToken = (res: Response) => cookieFrom(res, FEDERATED_MFA_COOKIE).slice(FEDERATED_MFA_COOKIE.length + 1);
async function submitCode(token: string, totp: string) {
  return challengePOST(new Request(`${ORIGIN}/api/federation/step-up`, { method: "POST", headers: { cookie: `${FEDERATED_MFA_COOKIE}=${token}`, origin: ORIGIN, "content-type": "application/json", "x-flowline-csrf": await confirmationCsrf(token) }, body: JSON.stringify({ code: totp }) }), undefined);
}
/** What a browser holding these cookies can do: nothing, when no session was issued. */
async function expectNoUsableSession(res: Response, userId: string) {
  expect(cookieFrom(res, await sessionCookieName())).toBe("");
  expect(await sessionRows(userId)).toHaveLength(0);
  const pending = cookieFrom(res, FEDERATED_MFA_COOKIE);
  if (pending) expect(await auth.api.getSession({ headers: new Headers({ cookie: pending }) })).toBeNull();
}

/** A verified workspace member signing in through the tenant's OIDC provider, optionally with an enrolled authenticator. */
async function workspaceMember(prefix: string, withTotp: boolean) {
  const { ws } = await configuredTenant();
  const user = await makeVerifiedUser(prefix);
  const secret = withTotp ? await enrolTotp(user.id) : "";
  await addMember(ws.id, user.id, "viewer");
  await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
  const attempt = await oidcAttempt(ws.slug, user.email);
  const callback = () => ssoCallback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `fl_sso_state=${attempt.state}` } }));
  return { ws, user, secret, callback };
}
async function githubUser(prefix: string, withTotp: boolean) {
  const user = await makeVerifiedUser(prefix);
  const secret = withTotp ? await enrolTotp(user.id) : "";
  const subject = Math.floor(Math.random() * 1_000_000_000);
  await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "github", accountId: String(subject) });
  return { user, secret, callback: () => githubCallback({ subject, email: user.email, next: "/app" }) };
}

describe("@issue-66 federated MFA enforcement (H3 regression)", () => {
  beforeEach(() => { mockTenantIdp(); });

  it("@e2e @flow:federated-mfa @issue-66 AC1: workspace SSO for an MFA-enrolled user stops at the MFA step without a session", async () => {
    const { ws, user, callback } = await workspaceMember("i66-ws-mfa", true);
    const res = await callback();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/step-up`);
    expect(pendingToken(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expectNoUsableSession(res, user.id);
    expect(await signInAudits(ws.id, user.id)).toHaveLength(0);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC1: a social (GitHub) callback for an MFA-enrolled user stops at the MFA step without a session", async () => {
    const { user, callback } = await githubUser("i66-gh-mfa", true);
    const res = await callback();
    expect(res.headers.get("location")).toContain("/auth/step-up");
    expect(pendingToken(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expectNoUsableSession(res, user.id);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC2: workspace SSO for a user without MFA still signs in and is audited", async () => {
    const { ws, user, callback } = await workspaceMember("i66-ws-plain", false);
    const res = await callback();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/w/${ws.slug}/flows`);
    expect(cookieFrom(res, FEDERATED_MFA_COOKIE)).toBe("");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieFrom(res, await sessionCookieName()) }) });
    expect(session?.user.id).toBe(user.id);
    expect(await sessionRows(user.id)).toHaveLength(1);
    expect(await signInAudits(ws.id, user.id)).toHaveLength(1);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC2: a social (GitHub) callback for a user without MFA still signs in", async () => {
    const { user, callback } = await githubUser("i66-gh-plain", false);
    const res = await callback();
    expect(new URL(res.headers.get("location")!, ORIGIN).href).toBe(`${ORIGIN}/app`);
    expect(cookieFrom(res, FEDERATED_MFA_COOKIE)).toBe("");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieFrom(res, await sessionCookieName()) }) });
    expect(session?.user.id).toBe(user.id);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC3: failed MFA codes leave no usable session and no sign-in audit; completion writes one", async () => {
    const { ws, user, secret, callback } = await workspaceMember("i66-ws-failed", true);
    const res = await callback();
    const token = pendingToken(res);
    const correct = code(secret);
    for (const wrong of ["000000", "111111", "222222"].filter((c) => c !== correct).slice(0, 2)) {
      const refused = await submitCode(token, wrong);
      expect(refused.status).toBe(403);
      expect((await refused.json()).error.code).toBe("FEDERATED_MFA_CODE_INVALID");
      await expectNoUsableSession(refused, user.id);
    }
    await expectNoUsableSession(res, user.id);
    // docs/security/FEDERATED_MFA.md: the workspace audit records a sign-in only when the local factor completes it.
    expect(await signInAudits(ws.id, user.id)).toHaveLength(0);
    const completed = await submitCode(token, correct);
    expect(completed.status).toBe(200);
    const audits = await signInAudits(ws.id, user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.data).toMatchObject({ localTotp: true });
  });

  it("@e2e @flow:federated-mfa @issue-66 AC3: an abandoned MFA step expires and can never be completed into a session", async () => {
    const { ws, user, secret, callback } = await workspaceMember("i66-ws-abandoned", true);
    const res = await callback();
    const token = pendingToken(res);
    await expectNoUsableSession(res, user.id);
    // The user walks away; the pending challenge outlives its 10-minute window.
    await db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.verification.identifier, `federated-mfa:${sha256Hex(token)}`));
    expect((await challengeGET(new Request(`${ORIGIN}/api/federation/step-up`, { headers: { cookie: `${FEDERATED_MFA_COOKIE}=${token}` } }), undefined)).status).toBe(401);
    const late = await submitCode(token, code(secret));
    expect(late.status).toBe(401);
    await expectNoUsableSession(late, user.id);
    expect(await signInAudits(ws.id, user.id)).toHaveLength(0);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC4: repeating the workspace SSO callback (same state and code) does not bypass MFA", async () => {
    const { user, callback } = await workspaceMember("i66-ws-replay", true);
    const first = await callback();
    expect(first.headers.get("location")).toBe(`${ORIGIN}/auth/step-up`);
    await expectNoUsableSession(first, user.id);
    const replayed = await callback();
    expect(replayed.headers.get("location")).toContain("/sign-in?sso_error=");
    expect(cookieFrom(replayed, FEDERATED_MFA_COOKIE)).toBe("");
    await expectNoUsableSession(replayed, user.id);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC4: repeating the social callback (same state and code) does not bypass MFA", async () => {
    const user = await makeVerifiedUser("i66-gh-replay");
    await enrolTotp(user.id);
    const subject = Math.floor(Math.random() * 1_000_000_000);
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "github", accountId: String(subject) });
    const { instance, request } = await githubCallbackRequest({ subject, email: user.email, next: "/app" });
    const first = await instance.handler(request.clone());
    expect(first.headers.get("location")).toContain("/auth/step-up");
    await expectNoUsableSession(first, user.id);
    const replayed = await instance.handler(request);
    expect(replayed.headers.get("location")).not.toContain("/auth/step-up");
    expect(cookieFrom(replayed, FEDERATED_MFA_COOKIE)).toBe("");
    await expectNoUsableSession(replayed, user.id);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC4: the pending MFA token is not a session and cannot be replayed after use", async () => {
    const { user, secret, callback } = await workspaceMember("i66-ws-token", true);
    const token = pendingToken(await callback());
    // Presented as a correctly signed session cookie, the pending token still grants nothing.
    const forged = await ssoSessionCookie(token);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: `${forged.name}=${forged.value}` }) })).toBeNull();
    expect(await sessionRows(user.id)).toHaveLength(0);
    expect((await submitCode(token, code(secret))).status).toBe(200);
    expect(await sessionRows(user.id)).toHaveLength(1);
    const replayed = await submitCode(token, code(secret, 1));
    expect(replayed.status).toBe(401);
    expect(cookieFrom(replayed, await sessionCookieName())).toBe("");
    expect(await sessionRows(user.id)).toHaveLength(1);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC3: an MFA-enrolled member with no linked federated identity gets no session from the SSO callback", async () => {
    const { ws } = await configuredTenant();
    const user = await makeVerifiedUser("i66-ws-nolink");
    await enrolTotp(user.id);
    await addMember(ws.id, user.id, "viewer");
    const attempt = await oidcAttempt(ws.slug, user.email);
    const res = await ssoCallback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `fl_sso_state=${attempt.state}` } }));
    expect(res.headers.get("location")).not.toBe(`${ORIGIN}/w/${ws.slug}/flows`);
    await expectNoUsableSession(res, user.id);
    expect(await signInAudits(ws.id, user.id)).toHaveLength(0);
  });

  it("@e2e @flow:federated-mfa @issue-66 AC3: the MFA step refuses a missing, malformed or unknown pending token", async () => {
    const { user } = await workspaceMember("i66-ws-badtoken", true);
    const noCookie = await challengePOST(new Request(`${ORIGIN}/api/federation/step-up`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ code: "123456" }) }), undefined);
    expect(noCookie.status).toBe(401);
    await expectNoUsableSession(noCookie, user.id);
    for (const token of ["garbage", "A".repeat(43)]) {
      const res = await submitCode(token, "123456");
      expect(res.status).toBe(401);
      await expectNoUsableSession(res, user.id);
    }
  });
});
