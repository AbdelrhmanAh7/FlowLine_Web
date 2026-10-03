import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => { throw new Error("No Next request context in service integration tests"); } }));
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { GET as ssoCallback } from "@/app/api/sso/callback/route";
import { GET as challengeGET, POST as challengePOST } from "@/app/api/federation/step-up/route";
import { GET as platformGET } from "@/app/api/platform/me/route";
import { confirmationCsrf } from "@/server/auth-confirmation";
import { createFederatedChallenge, FEDERATED_MFA_COOKIE } from "@/server/federated-mfa";
import { requirePlatformAdmin, requireStepUp, performStepUp } from "@/server/platform-access";
import { ssoProviderId } from "@/server/sso";
import { zitadelAccountId } from "@/server/zitadel-auth";
import { addMember, closeDb, expectHttpError } from "./helpers";
import { code, enrolTotp, makeVerifiedUser, ORIGIN, sessionFor } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt } from "./federation-fixture";
import { githubCallback, zitadelCallback } from "./zitadel-callback-fixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(closeDb);
const sessionRows = (userId: string) => db.select().from(schema.session).where(eq(schema.session.userId, userId));
const platformContext = { params: Promise.resolve({}) };
function cookieFrom(res: Response, name: string) {
  return res.headers.getSetCookie().filter((c) => c.startsWith(`${name}=`) && !/Max-Age=0/.test(c)).at(-1)?.split(";")[0] ?? "";
}
async function challengeRequest(token: string, input: { code: string; origin?: string; csrf?: string }) {
  return new Request(`${ORIGIN}/api/federation/step-up`, { method: "POST", headers: { cookie: `${FEDERATED_MFA_COOKIE}=${token}`, origin: input.origin ?? ORIGIN, "content-type": "application/json", "x-flowline-csrf": input.csrf ?? await confirmationCsrf(token) }, body: JSON.stringify({ code: input.code }) });
}
async function assertChallenge(response: Response, userId: string, secret: string, expectedNext: string, admin = false) {
  expect(response.headers.get("location")).toContain("/auth/step-up");
  expect(cookieFrom(response, (await auth.$context).authCookies.sessionToken.name)).toBe("");
  expect(await sessionRows(userId)).toHaveLength(0);
  const pendingCookie = cookieFrom(response, FEDERATED_MFA_COOKIE);
  expect(pendingCookie).toBeTruthy();
  const token = pendingCookie.slice(FEDERATED_MFA_COOKIE.length + 1);
  expect(await auth.api.getSession({ headers: new Headers({ cookie: pendingCookie }) })).toBeNull();
  expect((await platformGET(new Request(`${ORIGIN}/api/platform/me`, { headers: { cookie: pendingCookie } }), platformContext)).status).toBe(404);
  expect((await challengeGET(new Request(`${ORIGIN}/api/federation/step-up`, { headers: { cookie: pendingCookie } }), undefined)).status).toBe(200);
  const correct = code(secret);
  const wrong = correct === "000000" ? "111111" : "000000";
  expect((await challengePOST(await challengeRequest(token, { code: correct, origin: "https://attacker.example" }), undefined)).status).toBe(403);
  expect((await challengePOST(await challengeRequest(token, { code: correct, csrf: "wrong" }), undefined)).status).toBe(403);
  expect((await challengePOST(await challengeRequest(token, { code: wrong }), undefined)).status).toBe(403);
  expect(await sessionRows(userId)).toHaveLength(0);
  const success = await challengePOST(await challengeRequest(token, { code: correct }), undefined);
  expect(success.status).toBe(200);
  expect((await success.json()).next).toBe(expectedNext);
  const ctx = await auth.$context;
  const fullCookie = cookieFrom(success, ctx.authCookies.sessionToken.name);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: fullCookie }) });
  expect(session?.user.id).toBe(userId);
  expect(await sessionRows(userId)).toHaveLength(1);
  expect((await challengePOST(await challengeRequest(token, { code: correct }), undefined)).status).toBe(401);
  expect(await sessionRows(userId)).toHaveLength(1);
  if (admin) {
    const request = new Request(`${ORIGIN}/api/platform/me`, { headers: { cookie: fullCookie } });
    expect((await platformGET(request, platformContext)).status).toBe(200);
    const principal = await requirePlatformAdmin(request);
    await expectHttpError(requireStepUp(principal), 403, "STEP_UP_REQUIRED");
    await performStepUp(principal, code(secret));
    await expect(requireStepUp(principal)).resolves.toBeUndefined();
    const other = await sessionFor({ id: userId, email: session!.user.email });
    const unassured = await platformGET(new Request(`${ORIGIN}/api/platform/me`, { headers: { cookie: other.cookie } }), platformContext);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: other.cookie }) })).toBeNull();
    expect(unassured.status).toBe(404);
    expect((await unassured.json()).error.code).toBe("NOT_FOUND");
  }
}

describe("H3: workspace SSO enforces enrolled local TOTP", () => {
  beforeEach(() => { mockTenantIdp(); });
  for (const admin of [false, true]) it(`grants no usable session to an enrolled ${admin ? "administrator" : "ordinary user"} until local TOTP`, async () => {
    const { ws } = await configuredTenant();
    const user = await makeVerifiedUser("workspace-totp");
    const secret = await enrolTotp(user.id);
    if (admin) await db.insert(schema.platformAdmin).values({ userId: user.id, status: "active", grantedBy: "test" });
    await addMember(ws.id, user.id, "viewer");
    // Models an independently mailbox-approved existing link; this test attacks session issuance.
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
    const attempt = await oidcAttempt(ws.slug, user.email);
    const response = await ssoCallback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `fl_sso_state=${attempt.state}` } }));
    await assertChallenge(response, user.id, secret, `/w/${ws.slug}/flows`, admin);
  });
});

describe("H3: actual global ZITADEL callbacks enforce local TOTP", () => {
  for (const admin of [false, true]) it(`single-factor ZITADEL cannot bypass the ${admin ? "admin" : "user"}'s enrolled authenticator`, async () => {
    const user = await makeVerifiedUser("global-totp");
    const secret = await enrolTotp(user.id);
    if (admin) await db.insert(schema.platformAdmin).values({ userId: user.id, status: "active", grantedBy: "test" });
    const issuer = "https://platform-idp.example";
    const subject = randomUUID();
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "zitadel", accountId: zitadelAccountId(issuer, subject) });
    const { response } = await zitadelCallback({ issuer, subject, email: user.email, next: admin ? "/admin" : "/app" });
    await assertChallenge(response, user.id, secret, admin ? "/admin" : "/app", admin);
  });
  it("M7: replacing a global issuer cannot reuse its subject binding, while legitimate non-enrolled sign-in still works", async () => {
    const user = await makeVerifiedUser("global-issuer-owner");
    const subject = randomUUID();
    const issuer = "https://first-platform-idp.example";
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "zitadel", accountId: zitadelAccountId(issuer, subject) });
    const first = await zitadelCallback({ issuer, subject, email: user.email, next: "/app" });
    expect(new URL(first.response.headers.get("location")!, ORIGIN).href).toBe(`${ORIGIN}/app`);
    expect(await sessionRows(user.id)).toHaveLength(1);
    const second = await zitadelCallback({ issuer: "https://replacement-platform-idp.example", subject, email: user.email, next: "/app" });
    expect(second.response.headers.get("location")).toMatch(/[?&]error=/);
    const ctx = await auth.$context;
    expect(cookieFrom(second.response, ctx.authCookies.sessionToken.name)).toBe("");
    expect(await sessionRows(user.id)).toHaveLength(1);
  });
});

describe("H3: built-in social-provider callbacks enforce the same local factor", () => {
  for (const admin of [false, true]) it(`GitHub cannot bypass the enrolled ${admin ? "administrator" : "user"}'s TOTP`, async () => {
    const user = await makeVerifiedUser("github-totp");
    const secret = await enrolTotp(user.id);
    if (admin) await db.insert(schema.platformAdmin).values({ userId: user.id, status: "active", grantedBy: "test" });
    const subject = Math.floor(Math.random() * 1_000_000_000);
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "github", accountId: String(subject) });
    const next = admin ? "/admin" : "/app";
    await assertChallenge(await githubCallback({ subject, email: user.email, next }), user.id, secret, next, admin);
  });
});

// Written for CI; not executed during the resource-limited readiness review.
describe("H3 global pending authority and pre-enrollment sessions", () => {
  it("rejects a session created before TOTP enrollment at the shared session boundary", async () => {
    const user = await makeVerifiedUser("before-enrollment");
    const old = await sessionFor(user);
    const headers = new Headers({ cookie: old.cookie });
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(user.id);
    await enrolTotp(user.id);
    expect(await auth.api.getSession({ headers })).toBeNull();
    expect((await auth.handler(new Request(`${ORIGIN}/api/auth/list-accounts`, { headers }))).status).toBe(401);
  });

  for (const change of ["app revoked", "account unlinked", "password changed"] as const) {
    it(`rejects a global pending factor after ${change}`, async () => {
      const user = await makeVerifiedUser("global-pending");
      const secret = await enrolTotp(user.id);
      const subject = Math.floor(Math.random() * 1_000_000_000);
      await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "github", accountId: String(subject) });
      const response = await githubCallback({ subject, email: user.email, next: "/app" });
      const token = cookieFrom(response, FEDERATED_MFA_COOKIE).slice(FEDERATED_MFA_COOKIE.length + 1);
      expect(token).toBeTruthy();
      expect(await sessionRows(user.id)).toHaveLength(0);
      if (change === "app revoked") {
        const dispatch = await import("@/server/auth-dispatch");
        vi.mocked(dispatch.federatedProviderStamp).mockResolvedValue(null);
      }
      if (change === "account unlinked") await db.delete(schema.account).where(eq(schema.account.userId, user.id));
      if (change === "password changed") await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "credential", accountId: user.id, password: "synthetic-new-password-hash" });
      const refused = await challengePOST(await challengeRequest(token, { code: code(secret) }), undefined);
      expect(refused.status).toBe(401);
      expect(cookieFrom(refused, (await auth.$context).authCookies.sessionToken.name)).toBe("");
      expect(await sessionRows(user.id)).toHaveLength(0);
    });
  }
});

describe("pending factor lifetime and consumption", () => {
  it("refuses expired, recovered and changed-enrollment challenges; concurrent completions create exactly one session", async () => {
    const user = await makeVerifiedUser("pending-totp");
    const secret = await enrolTotp(user.id);
    const expired = await createFederatedChallenge(user.id, "/app");
    const { sha256Hex } = await import("@/server/crypto");
    await db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.verification.identifier, `federated-mfa:${sha256Hex(expired)}`));
    expect((await challengePOST(await challengeRequest(expired, { code: code(secret) }), undefined)).status).toBe(401);
    const recovered = await createFederatedChallenge(user.id, "/app");
    await db.update(schema.user).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.user.id, user.id));
    expect((await challengePOST(await challengeRequest(recovered, { code: code(secret) }), undefined)).status).toBe(401);
    const changed = await createFederatedChallenge(user.id, "/app");
    await enrolTotp(user.id);
    expect((await challengePOST(await challengeRequest(changed, { code: code(secret) }), undefined)).status).toBe(403);
    expect(await sessionRows(user.id)).toHaveLength(0);
    const current = await enrolTotp(user.id);
    const pending = await createFederatedChallenge(user.id, "/app");
    const [a, b] = await Promise.all([challengePOST(await challengeRequest(pending, { code: code(current) }), undefined), challengePOST(await challengeRequest(pending, { code: code(current) }), undefined)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    expect(await sessionRows(user.id)).toHaveLength(1);
  });
});

// Written for CI (PostgreSQL concurrency and the real route); not executed locally. Codes are computed once, so a 30 s
// boundary crossed mid-test cannot change which step a code belongs to.
describe("federated TOTP codes cannot be replayed", () => {
  it("accepts a code once per user across fresh challenges, refuses older steps, and keeps a refused challenge usable", async () => {
    const user = await makeVerifiedUser("totp-replay");
    const secret = await enrolTotp(user.id);
    const current = code(secret);
    const next = code(secret, 1);
    const sessionCookie = (await auth.$context).authCookies.sessionToken.name;
    const first = await createFederatedChallenge(user.id, "/app");
    expect((await challengePOST(await challengeRequest(first, { code: current }), undefined)).status).toBe(200);
    expect(await sessionRows(user.id)).toHaveLength(1);
    const replayed = await createFederatedChallenge(user.id, "/app");
    const refused = await challengePOST(await challengeRequest(replayed, { code: current }), undefined);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error.code).toBe("FEDERATED_MFA_CODE_INVALID");
    expect(cookieFrom(refused, sessionCookie)).toBe("");
    expect(await sessionRows(user.id)).toHaveLength(1); // the refused attempt's unissued session was removed
    const marker = async () => (await db.select().from(schema.verification).where(eq(schema.verification.id, `totp-step:${user.id}`)))[0]?.value;
    const consumed = await marker();
    expect(consumed).toMatch(/^\d+$/);
    // The refusal rolled back with the transaction: the pending challenge survives and the next code completes it.
    expect((await challengePOST(await challengeRequest(replayed, { code: next }), undefined)).status).toBe(200);
    expect(await sessionRows(user.id)).toHaveLength(2);
    expect(Number(await marker())).toBe(Number(consumed) + 1);
    const older = await createFederatedChallenge(user.id, "/app");
    expect((await challengePOST(await challengeRequest(older, { code: current }), undefined)).status).toBe(403);
    expect(await sessionRows(user.id)).toHaveLength(2);
    expect(Number(await marker())).toBe(Number(consumed) + 1);
  });

  it("lets only one of two concurrent challenges use the same code", async () => {
    const user = await makeVerifiedUser("totp-replay-race");
    const secret = await enrolTotp(user.id);
    const current = code(secret);
    const a = await createFederatedChallenge(user.id, "/app");
    const b = await createFederatedChallenge(user.id, "/app");
    const results = await Promise.all([challengePOST(await challengeRequest(a, { code: current }), undefined), challengePOST(await challengeRequest(b, { code: current }), undefined)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
    expect(await sessionRows(user.id)).toHaveLength(1);
  });

  it("does not burn a code when the pending authority fails inside the completion transaction", async () => {
    const user = await makeVerifiedUser("totp-replay-revoked");
    const secret = await enrolTotp(user.id);
    const current = code(secret);
    const stale = await createFederatedChallenge(user.id, "/app");
    // The account/password fingerprint is only rechecked inside the transaction, after the code itself verified.
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: "credential", accountId: user.id, password: "synthetic-new-password-hash" });
    expect((await challengePOST(await challengeRequest(stale, { code: current }), undefined)).status).toBe(401);
    expect(await db.select().from(schema.verification).where(eq(schema.verification.id, `totp-step:${user.id}`))).toHaveLength(0);
    const fresh = await createFederatedChallenge(user.id, "/app");
    expect((await challengePOST(await challengeRequest(fresh, { code: current }), undefined)).status).toBe(200);
  });
});

describe("H3 pending workspace authority fences", () => {
  it("refuses factor completion after the session that initiated SSO is revoked", async () => {
    mockTenantIdp();
    const { ws } = await configuredTenant();
    const user = await makeVerifiedUser("pending-initiator");
    const secret = await enrolTotp(user.id);
    await addMember(ws.id, user.id, "viewer");
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
    const { assuredSessionFor } = await import("./platform-helpers");
    const initiator = await assuredSessionFor(user, secret);
    const attempt = await oidcAttempt(ws.slug, user.email, initiator);
    const response = await ssoCallback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `fl_sso_state=${attempt.state}; ${initiator.cookie}` } }));
    const pending = cookieFrom(response, FEDERATED_MFA_COOKIE).slice(FEDERATED_MFA_COOKIE.length + 1);
    expect(pending).toBeTruthy();
    expect(cookieFrom(response, (await auth.$context).authCookies.sessionToken.name)).toBe("");
    await db.delete(schema.session).where(eq(schema.session.token, initiator.token));
    const rejected = await challengePOST(await challengeRequest(pending, { code: code(secret) }), undefined);
    expect(rejected.status).toBe(401);
    expect(cookieFrom(rejected, (await auth.$context).authCookies.sessionToken.name)).toBe("");
    expect(await sessionRows(user.id)).toHaveLength(0);
  });

  for (const change of ["configuration", "disabled", "membership", "binding", "mailbox"] as const) {
    it(`refuses a pending factor after ${change} changes and removes the unissued session`, async () => {
      mockTenantIdp();
      const { ws } = await configuredTenant();
      const user = await makeVerifiedUser("pending-authority");
      const secret = await enrolTotp(user.id);
      await addMember(ws.id, user.id, "viewer");
      const providerId = ssoProviderId(ws.id, ISSUER, "test-client");
      await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId, accountId: "attacker-subject" });
      const attempt = await oidcAttempt(ws.slug, user.email);
      const response = await ssoCallback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `fl_sso_state=${attempt.state}` } }));
      const pending = cookieFrom(response, FEDERATED_MFA_COOKIE).slice(FEDERATED_MFA_COOKIE.length + 1);
      expect(pending).toBeTruthy();
      expect(await sessionRows(user.id)).toHaveLength(0);
      if (change === "configuration") await db.update(schema.ssoConfig).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.ssoConfig.workspaceId, ws.id));
      if (change === "disabled") await db.update(schema.ssoConfig).set({ enabled: false }).where(eq(schema.ssoConfig.workspaceId, ws.id));
      if (change === "membership") await db.delete(schema.workspaceMember).where(eq(schema.workspaceMember.userId, user.id));
      if (change === "binding") await db.delete(schema.account).where(eq(schema.account.userId, user.id));
      if (change === "mailbox") await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, user.id));
      const rejected = await challengePOST(await challengeRequest(pending, { code: code(secret) }), undefined);
      expect(rejected.status).toBe(401);
      expect(cookieFrom(rejected, (await auth.$context).authCookies.sessionToken.name)).toBe("");
      expect(await sessionRows(user.id)).toHaveLength(0);
    });
  }

  it("rechecks authority after Better Auth's adapter hooks and never publishes a stale session", async () => {
    mockTenantIdp();
    const { ws } = await configuredTenant();
    const user = await makeVerifiedUser("factor-adapter-race");
    const secret = await enrolTotp(user.id);
    await addMember(ws.id, user.id, "viewer");
    await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
    const attempt = await oidcAttempt(ws.slug, user.email);
    const response = await ssoCallback(new Request(`${ORIGIN}/api/sso/callback?state=${attempt.state}&code=${attempt.code}`, { headers: { cookie: `fl_sso_state=${attempt.state}` } }));
    const pending = cookieFrom(response, FEDERATED_MFA_COOKIE).slice(FEDERATED_MFA_COOKIE.length + 1);
    expect(pending).toBeTruthy();
    const ctx = await auth.$context;
    const createSession = ctx.internalAdapter.createSession.bind(ctx.internalAdapter);
    vi.spyOn(ctx.internalAdapter, "createSession").mockImplementationOnce(async (...args) => {
      const session = await createSession(...args);
      await db.update(schema.ssoConfig).set({ enabled: false }).where(eq(schema.ssoConfig.workspaceId, ws.id));
      return session;
    });
    expect((await challengePOST(await challengeRequest(pending, { code: code(secret) }), undefined)).status).toBe(401);
    expect(await sessionRows(user.id)).toHaveLength(0);
  });
});
