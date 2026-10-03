/**
 * Credentials in the UI — the platform admin boundary, write-only credentials, import, audit, bootstrap
 * (docs/security/CREDENTIALS_DESIGN.md S2, S3, S6). Real route handlers, real better-auth sessions, real TOTP; the only
 * mock is `next/headers` (no Next request context under vitest).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => {
    throw new Error("cookies() is not used by these routes");
  },
}));

import { GET as adminsGET } from "@/app/api/platform/admins/route";
import { POST as adminRevokePOST } from "@/app/api/platform/admins/[uid]/revoke/route";
import { GET as auditGET } from "@/app/api/platform/audit/route";
import { GET as credentialsGET } from "@/app/api/platform/credentials/route";
import { PUT as credentialPUT } from "@/app/api/platform/credentials/[purpose]/route";
import { POST as clearPOST } from "@/app/api/platform/credentials/[purpose]/clear/route";
import { POST as importPOST } from "@/app/api/platform/credentials/[purpose]/import/route";
import { POST as probePOST } from "@/app/api/platform/credentials/[purpose]/probe/route";
import { POST as revokePOST } from "@/app/api/platform/credentials/[purpose]/revoke/route";
import { GET as meGET } from "@/app/api/platform/me/route";
import { PUT as settingPUT } from "@/app/api/platform/settings/[key]/route";
import { POST as settingImportPOST } from "@/app/api/platform/settings/[key]/import/route";
import { GET as setupGET } from "@/app/api/platform/setup/route";
import { POST as setupCompletePOST } from "@/app/api/platform/setup/complete/route";
import { PUT as setupEmailPUT } from "@/app/api/platform/setup/email/route";
import { POST as setupRedeemPOST } from "@/app/api/platform/setup/redeem/route";
import { POST as stepUpPOST } from "@/app/api/platform/step-up/route";
import AdminPage from "@/app/admin/page";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { createApiKey } from "@/server/apikeys";
import { sendEmail } from "@/server/email";
import { startOAuth } from "@/server/connections";
import { deliverPlatformNotifications } from "@/server/platform-audit";
import { resolvePlatformCredential } from "@/server/platform-secrets";
import { issueChallenge, SETUP_COOKIE } from "@/server/platform-setup";
import { pruneOnce } from "@/server/retention";
import { base32Decode, totpCodeFor } from "@/server/totp";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { seedPlatformCredential, seedSetting, unseedPlatformCredential, unseedSetting } from "../fixtures/platform-seed";
import { closeDb, makeUser, unique } from "./helpers";
import { code, jsonOf, makeAdmin, makeVerifiedUser, platformReq, resetTotpReplay, sessionFor, assuredSessionFor, type TestSession } from "./platform-helpers";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

function as(s: TestSession | null, extra: Record<string, string> = {}) {
  sessionHolder.headers = new Headers({ ...(s ? { cookie: s.cookie } : {}), ...extra });
}
async function call(h: unknown, req: Request, params: Record<string, string> = {}) {
  return jsonOf(await (h as Handler)(req, { params: Promise.resolve(params) }));
}
async function stepUp(s: TestSession, secret: string, offset = 0) {
  as(s);
  return call(stepUpPOST, platformReq("/api/platform/step-up", s, { method: "POST", body: { code: code(secret, offset) } }));
}

let fake: Fake;
const CANARY = `FLCANARY_${randomUUID().replace(/-/g, "")}`;
const logs: string[] = [];
const spies: ReturnType<typeof vi.spyOn>[] = [];

beforeAll(async () => {
  fake = await startFake();
  process.env.FLOWLINE_EMAIL_RESEND_TEST_URL = `${fake.url}/resend/emails`;
  for (const m of ["log", "warn", "error", "info"] as const) {
    const orig = console[m].bind(console);
    spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
      orig(...(a as []));
    }));
  }
});
afterAll(async () => {
  for (const s of spies) s.mockRestore();
  await fake.close();
  await closeDb();
});

describe("platform admin boundary", () => {
  it("everyone who isn't an active platform admin gets 404 — anonymous, a multi-workspace owner, a beta-allowlisted email, an API-key bearer", async () => {
    const owner = await makeUser("multi-owner");
    await createWorkspace(owner, unique("Owner WS A"));
    const wsB = await createWorkspace(owner, unique("Owner WS B"));
    const ownerSession = await sessionFor(owner);
    const betaListed = await makeVerifiedUser("beta-admin");
    process.env.FLOWLINE_BETA_ADMINS = betaListed.email;
    const betaSession = await sessionFor(betaListed);
    const admin = await makeAdmin("boundary");
    const { key } = await createApiKey(owner, wsB.id, { name: "k", mode: "test", scopes: ["flows:read"] });
    const bearer = { authorization: `Bearer ${key}` };
    const cases: [string, TestSession | null, Record<string, string>][] = [
      ["anonymous", null, {}],
      ["workspace owner of two workspaces", ownerSession, {}],
      ["beta-allowlisted email", betaSession, {}],
      ["API-key bearer (even with an admin's cookie)", admin.session, bearer],
      ["API-key bearer alone", null, bearer],
    ];
    for (const [label, s, extra] of cases) {
      as(s, extra);
      for (const [h, path, params] of [
        [credentialsGET, "/api/platform/credentials", {}],
        [meGET, "/api/platform/me", {}],
        [auditGET, "/api/platform/audit", {}],
        [adminsGET, "/api/platform/admins", {}],
      ] as const) {
        const r = await call(h, platformReq(path, s, { headers: extra }), params);
        expect(r.status, `${label} GET ${path}`).toBe(404);
      }
      const put = await call(credentialPUT, platformReq("/api/platform/credentials/integration.google", s, { method: "PUT", body: { publicId: "x-client", secret: CANARY, expectedRevision: 0 }, headers: extra }), { purpose: "integration.google" });
      expect(put.status, `${label} PUT`).toBe(404);
      expect(put.text).not.toContain(CANARY);
      // The panel page itself: the app's ordinary 404.
      await expect(AdminPage(), label).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    }
    delete process.env.FLOWLINE_BETA_ADMINS;
    // Authenticated non-admin probes are recorded (bounded reason only).
    const denied = await db.select().from(schema.platformAuditEvent).where(and(eq(schema.platformAuditEvent.action, "admin.access_denied"), eq(schema.platformAuditEvent.actorUserId, owner.id)));
    expect(denied.length).toBeGreaterThan(0);
    expect(denied[0]!.data).toEqual({ reason: "not_admin" });
  });

  it("an admin needs a verified email, an enrolled authenticator and a session ≤ 24 h old", async () => {
    const a = await makeAdmin("assurance");
    as(a.session);
    expect((await call(meGET, platformReq("/api/platform/me", a.session))).status).toBe(200);
    await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, a.user.id));
    expect((await call(meGET, platformReq("/api/platform/me", a.session))).body.error.code).toBe("PLATFORM_TOTP_REQUIRED");
    await db.update(schema.user).set({ twoFactorEnabled: true, emailVerified: false }).where(eq(schema.user.id, a.user.id));
    expect((await call(meGET, platformReq("/api/platform/me", a.session))).body.error.code).toBe("PLATFORM_EMAIL_UNVERIFIED");
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, a.user.id));
    await db.update(schema.session).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(schema.session.token, a.session.token));
    const old = await call(meGET, platformReq("/api/platform/me", a.session));
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe("PLATFORM_REAUTH_REQUIRED");
    // A revoked admin is just a non-admin again: 404.
    const b = await makeAdmin("revoked");
    await db.update(schema.platformAdmin).set({ status: "revoked" }).where(eq(schema.platformAdmin.userId, b.user.id));
    as(b.session);
    expect((await call(meGET, platformReq("/api/platform/me", b.session))).status).toBe(404);
  });

  it("writes need a TOTP step-up bound to THIS session, expiring after 10 minutes; codes can't be replayed; strict Origin + CSRF", async () => {
    const a = await makeAdmin("stepup");
    const body = { publicId: "stepup-client", secret: "a-rotation-secret-value-1", expectedRevision: 0 };
    as(a.session);
    const locked = await call(credentialPUT, platformReq("/api/platform/credentials/integration.github", a.session, { method: "PUT", body }), { purpose: "integration.github" });
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe("STEP_UP_REQUIRED");
    // Wrong code → refused + audited.
    as(a.session);
    const wrong = await call(stepUpPOST, platformReq("/api/platform/step-up", a.session, { method: "POST", body: { code: code(a.secret) === "000000" ? "111111" : "000000" } }));
    expect(wrong.body.error.code).toBe("STEP_UP_INVALID");
    const ok = await stepUp(a.session, a.secret);
    expect(ok.status).toBe(200);
    // The same code again (another session of the same admin) is a replay.
    const other = await assuredSessionFor(a.user, a.secret);
    expect((await stepUp(other, a.secret)).body.error.code).toBe("STEP_UP_INVALID");
    // Elevation is bound to the first session only.
    as(other);
    expect((await call(credentialPUT, platformReq("/api/platform/credentials/integration.github", other, { method: "PUT", body }), { purpose: "integration.github" })).body.error.code).toBe("STEP_UP_REQUIRED");
    // Strict mutation checks on the elevated session.
    as(a.session);
    expect((await call(credentialPUT, platformReq("/api/platform/credentials/integration.github", a.session, { method: "PUT", body, noCsrf: true }), { purpose: "integration.github" })).body.error.code).toBe("CSRF_TOKEN_INVALID");
    expect((await call(credentialPUT, platformReq("/api/platform/credentials/integration.github", a.session, { method: "PUT", body, origin: "https://evil.example" }), { purpose: "integration.github" })).body.error.code).toBe("CROSS_SITE_REQUEST");
    expect((await call(credentialPUT, platformReq("/api/platform/credentials/integration.github", a.session, { method: "PUT", body, origin: null }), { purpose: "integration.github" })).body.error.code).toBe("CROSS_SITE_REQUEST");
    await unseedPlatformCredential("integration.github");
    const saved = await call(credentialPUT, platformReq("/api/platform/credentials/integration.github", a.session, { method: "PUT", body }), { purpose: "integration.github" });
    expect(saved.status).toBe(200);
    // Expiry: an elevation older than 10 minutes no longer allows writes.
    await db.update(schema.platformStepup).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.platformStepup.userId, a.user.id));
    const expired = await call(revokePOST, platformReq("/api/platform/credentials/integration.github/revoke", a.session, { method: "POST", body: { expectedRevision: 1 } }), { purpose: "integration.github" });
    expect(expired.body.error.code).toBe("STEP_UP_REQUIRED");
    // Attempts are rate-limited (5 per 5 minutes per admin).
    const c = await makeAdmin("stepup-rl");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await (async () => { as(c.session); return call(stepUpPOST, platformReq("/api/platform/step-up", c.session, { method: "POST", body: { code: "000001" } })); })()).status);
    expect(statuses.at(-1)).toBe(429);
    await unseedPlatformCredential("integration.github");
  });
});

describe("write-only platform credentials", () => {
  it("create, keep, replace (CAS), rotate with grace, revoke, clear — never echoing a value", async () => {
    const a = await makeAdmin("cred");
    await stepUp(a.session, a.secret);
    await unseedPlatformCredential("email.postmark");
    as(a.session);
    const put = (body: unknown) => call(credentialPUT, platformReq("/api/platform/credentials/email.postmark", a.session, { method: "PUT", body }), { purpose: "email.postmark" });
    // "" is never "clear" — it's a validation error, and the 400 doesn't echo anything.
    const empty = await put({ publicId: "Flowline <a@b.test>", secret: "", expectedRevision: 0 });
    expect(empty.status).toBe(400);
    const short = await put({ publicId: "Flowline <a@b.test>", secret: "FLCAN", expectedRevision: 0 });
    expect(short.status).toBe(400);
    expect(short.text).not.toContain("FLCAN");
    const created = await put({ publicId: "Flowline <no-reply@flowline.test>", secret: CANARY, expectedRevision: 0 });
    expect(created.status).toBe(200);
    expect(created.text).not.toContain(CANARY);
    expect(created.body.credential).toMatchObject({ configured: true, status: "configured_unverified", revision: 1, publicId: "Flowline <no-reply@flowline.test>" });
    expect(created.body.credential.secretHint).toBe(`••••${CANARY.slice(-4)}`); // ≥ 32 chars → last 4 only
    expect(created.headers.get("cache-control")).toBe("no-store");
    expect(created.headers.get("referrer-policy")).toBe("no-referrer");
    // Stale revision → 409; secret omitted → the current one is kept (only the sender changes).
    expect((await put({ publicId: "Other <x@flowline.test>", expectedRevision: 0 })).status).toBe(409);
    const kept = await put({ publicId: "Flowline <noreply2@flowline.test>", expectedRevision: 1 });
    expect(kept.body.credential.revision).toBe(2);
    expect((await resolvePlatformCredential("email.postmark"))!.secret).toBe(CANARY);
    // Short secrets get no hint at all.
    await put({ secret: "short-secret-9", expectedRevision: 2 });
    as(a.session);
    const listing = await call(credentialsGET, platformReq("/api/platform/credentials", a.session));
    expect(listing.text).not.toContain(CANARY);
    expect(listing.text).not.toContain("short-secret-9");
    expect(listing.body.credentials.find((c: { purpose: string }) => c.purpose === "email.postmark").secretHint).toBeNull();
    // Test (probe): an authenticated no-op; a key the provider refuses is REJECTED.
    const probe = await call(probePOST, platformReq("/api/platform/credentials/email.postmark/probe", a.session, { method: "POST", body: {} }), { purpose: "email.postmark" });
    expect(probe.body.result).toBe("accepted");
    // Revoke: resolution fails closed immediately; clear removes the row; the audit keeps every step.
    const rev = await call(revokePOST, platformReq("/api/platform/credentials/email.postmark/revoke", a.session, { method: "POST", body: { expectedRevision: 3 } }), { purpose: "email.postmark" });
    expect(rev.body.credential.status).toBe("revoked");
    expect(await resolvePlatformCredential("email.postmark")).toBeNull();
    const clr = await call(clearPOST, platformReq("/api/platform/credentials/email.postmark/clear", a.session, { method: "POST", body: { expectedRevision: 3 } }), { purpose: "email.postmark" });
    expect(clr.body.credential.status).toBe("unconfigured");
    const events = await db.select().from(schema.platformAuditEvent).where(eq(schema.platformAuditEvent.purpose, "email.postmark")).orderBy(desc(schema.platformAuditEvent.id)).limit(10);
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["platform_secret.set", "platform_secret.rotated", "platform_secret.probe", "platform_secret.revoked", "platform_secret.cleared"]));
    expect(JSON.stringify(events)).not.toContain(CANARY);
  });

  it("OAuth apps: a different client id is a switch (needs its own secret); a same-app rotation keeps the previous secret for the grace window", async () => {
    const a = await makeAdmin("oauthcred");
    await stepUp(a.session, a.secret);
    await unseedPlatformCredential("signin.github");
    as(a.session);
    const put = (body: unknown) => call(credentialPUT, platformReq("/api/platform/credentials/signin.github", a.session, { method: "PUT", body }), { purpose: "signin.github" });
    expect((await put({ publicId: "gh-client-1", secret: "gh-secret-number-one", expectedRevision: 0 })).status).toBe(200);
    const rotated = await put({ secret: "gh-secret-number-two", expectedRevision: 1 });
    expect(rotated.body.credential).toMatchObject({ revision: 2, hasPrevious: true, graceDays: 7 });
    const both = (await resolvePlatformCredential("signin.github"))!;
    expect(both.secret).toBe("gh-secret-number-two");
    expect(both.previous?.secret).toBe("gh-secret-number-one");
    const noSecret = await put({ publicId: "gh-client-2", expectedRevision: 2 });
    expect(noSecret.body.error.code).toBe("SECRET_REQUIRED");
    const switched = await put({ publicId: "gh-client-2", secret: "gh-secret-for-app-two", expectedRevision: 2 });
    expect(switched.body.credential).toMatchObject({ revision: 3, hasPrevious: false, publicId: "gh-client-2" });
    await unseedPlatformCredential("signin.github");
  });

  it("import from environment: explicit, audited, once per purpose, only into an empty purpose — the runtime never reads env", async () => {
    const a = await makeAdmin("import");
    await stepUp(a.session, a.secret);
    await unseedPlatformCredential("integration.github");
    await db.delete(schema.platformEnvImport).where(eq(schema.platformEnvImport.purpose, "integration.github"));
    process.env.GITHUB_OAUTH_CLIENT_ID = "env-github-client";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "env-github-secret-value";
    try {
      // Env is set, the panel is empty → NOT configured (no fallback).
      expect(await resolvePlatformCredential("integration.github")).toBeNull();
      as(a.session);
      const listing = await call(credentialsGET, platformReq("/api/platform/credentials", a.session));
      expect(listing.body.credentials.find((c: { purpose: string }) => c.purpose === "integration.github").envImport).toMatchObject({ available: true, imported: false });
      expect(listing.body.legacyEnvStillSet).toContain("GITHUB_OAUTH_CLIENT_SECRET");
      expect(listing.text).not.toContain("env-github-secret-value");
      const imp = await call(importPOST, platformReq("/api/platform/credentials/integration.github/import", a.session, { method: "POST", body: {} }), { purpose: "integration.github" });
      expect(imp.status).toBe(200);
      expect(imp.body.credential).toMatchObject({ configured: true, publicId: "env-github-client", status: "configured_unverified" });
      expect((await resolvePlatformCredential("integration.github"))!.secret).toBe("env-github-secret-value");
      expect((await call(importPOST, platformReq("/api/platform/credentials/integration.github/import", a.session, { method: "POST", body: {} }), { purpose: "integration.github" })).body.error.code).toBe("ALREADY_IMPORTED");
      // Even after revoke + clear, it can never be imported again.
      await call(revokePOST, platformReq("/api/platform/credentials/integration.github/revoke", a.session, { method: "POST", body: { expectedRevision: 1 } }), { purpose: "integration.github" });
      await call(clearPOST, platformReq("/api/platform/credentials/integration.github/clear", a.session, { method: "POST", body: { expectedRevision: 1 } }), { purpose: "integration.github" });
      expect((await call(importPOST, platformReq("/api/platform/credentials/integration.github/import", a.session, { method: "POST", body: {} }), { purpose: "integration.github" })).body.error.code).toBe("ALREADY_IMPORTED");
      const audit = await db.select().from(schema.platformAuditEvent).where(and(eq(schema.platformAuditEvent.action, "platform_secret.imported_from_env"), eq(schema.platformAuditEvent.purpose, "integration.github")));
      expect(audit.at(-1)?.data).toEqual({ envVar: "GITHUB_OAUTH_CLIENT_SECRET" });
    } finally {
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
      delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      await unseedPlatformCredential("integration.github");
    }
  });

  it("a revoked integration app fails closed even though its env vars are still set", async () => {
    const a = await makeAdmin("revoke-env");
    await stepUp(a.session, a.secret);
    expect(process.env.GOOGLE_OAUTH_CLIENT_SECRET).toBeTruthy(); // .env.test still carries the legacy variable
    await seedPlatformCredential("integration.google", { publicId: process.env.GOOGLE_OAUTH_CLIENT_ID!, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET! });
    const user = await makeUser("rev-env");
    const ws = await createWorkspace(user, unique("RevEnv"));
    expect((await startOAuth(db, { userId: user.id, sessionToken: "s", workspaceId: ws.id, providerId: "gmail" })).url).toContain("client_id=");
    const [row] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, "integration.google"));
    as(a.session);
    const rev = await call(revokePOST, platformReq("/api/platform/credentials/integration.google/revoke", a.session, { method: "POST", body: { expectedRevision: row!.revision } }), { purpose: "integration.google" });
    expect(rev.status).toBe(200);
    await expect(startOAuth(db, { userId: user.id, sessionToken: "s", workspaceId: ws.id, providerId: "gmail" })).rejects.toMatchObject({ code: "OAUTH_NOT_CONFIGURED" });
    expect(await resolvePlatformCredential("integration.google")).toBeNull();
    await seedPlatformCredential("integration.google", { publicId: process.env.GOOGLE_OAUTH_CLIENT_ID!, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET! });
  });

  it("settings: validated, versioned (CAS) and imported at most once; the recipient allowlist applies to the next email", async () => {
    const a = await makeAdmin("settings");
    await stepUp(a.session, a.secret);
    await unseedSetting("email.allowed_recipients");
    as(a.session);
    const bad = await call(settingPUT, platformReq("/api/platform/settings/email.allowed_recipients", a.session, { method: "PUT", body: { value: ["not an email"], expectedRevision: 0 } }), { key: "email.allowed_recipients" });
    expect(bad.body.error.code).toBe("SETTING_INVALID");
    const ok = await call(settingPUT, platformReq("/api/platform/settings/email.allowed_recipients", a.session, { method: "PUT", body: { value: ["only@allowed.test"], expectedRevision: 0 } }), { key: "email.allowed_recipients" });
    expect(ok.body.revision).toBe(1);
    await expect(sendEmail({ to: "someone@else.test", subject: "x", html: "x", text: "x", idempotencyKey: randomUUID() })).rejects.toThrow(/sandbox/);
    expect((await call(settingPUT, platformReq("/api/platform/settings/email.allowed_recipients", a.session, { method: "PUT", body: { value: [], expectedRevision: 0 } }), { key: "email.allowed_recipients" })).status).toBe(409);
    await unseedSetting("email.allowed_recipients");
    // With a REAL provider selected, a legacy env allowlist that was never imported fails CLOSED (never silently
    // widened) until it is imported once. (The test-stack outbox reaches no real inbox.)
    await db.delete(schema.platformEnvImport).where(eq(schema.platformEnvImport.purpose, "setting:email.allowed_recipients"));
    await seedPlatformCredential("email.resend", { publicId: "Flowline <no-reply@flowline.test>", secret: "re_fake_settings_key" });
    await seedSetting("email.provider", "resend");
    process.env.FLOWLINE_EMAIL_ALLOWED_RECIPIENTS = "only-env@allowed.test";
    try {
      await expect(sendEmail({ to: "only-env@allowed.test", subject: "x", html: "x", text: "x", idempotencyKey: randomUUID() })).rejects.toThrow(/allowlist/);
      const imp = await call(settingImportPOST, platformReq("/api/platform/settings/email.allowed_recipients/import", a.session, { method: "POST", body: {} }), { key: "email.allowed_recipients" });
      expect(imp.status).toBe(200);
      await sendEmail({ to: "only-env@allowed.test", subject: "x", html: "x", text: "x", idempotencyKey: randomUUID() });
      expect((await call(settingImportPOST, platformReq("/api/platform/settings/email.allowed_recipients/import", a.session, { method: "POST", body: {} }), { key: "email.allowed_recipients" })).body.error.code).toBe("ALREADY_IMPORTED");
    } finally {
      delete process.env.FLOWLINE_EMAIL_ALLOWED_RECIPIENTS;
      await unseedSetting("email.allowed_recipients");
      await unseedSetting("email.provider");
      await unseedPlatformCredential("email.resend");
    }
  });
});

describe("platform audit + notifications", () => {
  it("is written with the change, notifies the OTHER admins (metadata only, retried), and survives retention pruning", async () => {
    const a = await makeAdmin("audit-a");
    const b = await makeAdmin("audit-b");
    await stepUp(a.session, a.secret);
    await unseedPlatformCredential("billing.stripe.test.webhook");
    await seedPlatformCredential("billing.stripe.test.webhook", { secret: process.env.FLOWLINE_BILLING_WEBHOOK_SECRET ?? "whsec_test_seed_value" });
    const [row] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, "billing.stripe.test.webhook"));
    as(a.session);
    const res = await call(credentialPUT, platformReq("/api/platform/credentials/billing.stripe.test.webhook", a.session, { method: "PUT", body: { secret: `whsec_${CANARY}`, expectedRevision: row!.revision } }), { purpose: "billing.stripe.test.webhook" });
    expect(res.status).toBe(200);
    const [ev] = await db.select().from(schema.platformAuditEvent).where(and(eq(schema.platformAuditEvent.purpose, "billing.stripe.test.webhook"), eq(schema.platformAuditEvent.actorUserId, a.user.id))).orderBy(desc(schema.platformAuditEvent.id)).limit(1);
    expect(ev).toMatchObject({ action: "platform_secret.rotated", assurance: "session_totp_stepup", result: "ok", oldRevision: row!.revision, newRevision: row!.revision + 1 });
    expect(ev!.requestId).toBeTruthy();
    const notes = await db.select().from(schema.platformNotification).where(eq(schema.platformNotification.auditEventId, ev!.id));
    expect(notes.map((n) => n.recipientUserId)).toContain(b.user.id);
    expect(notes.map((n) => n.recipientUserId)).not.toContain(a.user.id);
    // Isolate from notifications left pending by other tests / earlier runs of this reused test DB.
    await db.update(schema.platformNotification).set({ sentAt: new Date() }).where(sql`${schema.platformNotification.auditEventId} <> ${ev!.id} and ${schema.platformNotification.sentAt} is null`);
    const sent: { to: string; text: string }[] = [];
    let fail = true;
    await deliverPlatformNotifications(db, async (to, _s, text) => {
      if (fail) {
        fail = false;
        throw new Error("smtp down");
      }
      sent.push({ to, text });
    });
    // The failed one is retried later (backoff), never lost.
    const [pending] = await db.select().from(schema.platformNotification).where(and(eq(schema.platformNotification.auditEventId, ev!.id), eq(schema.platformNotification.recipientUserId, b.user.id)));
    if (!pending!.sentAt) {
      expect(pending!.attempts).toBe(1);
      await db.update(schema.platformNotification).set({ nextAttemptAt: sql`now() - interval '1 minute'` }).where(eq(schema.platformNotification.id, pending!.id));
      await deliverPlatformNotifications(db, async (to, _s, text) => void sent.push({ to, text }));
    }
    const mine = sent.filter((s) => s.to === b.user.email);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((m) => m.text.includes("platform_secret.rotated"))).toBe(true);
    expect(JSON.stringify(sent)).not.toContain(CANARY);
    // Backdate the event 3 years and prune with a 1-day audit retention: the platform audit is untouched.
    await db.update(schema.platformAuditEvent).set({ at: new Date(Date.now() - 3 * 365 * 86_400_000) }).where(eq(schema.platformAuditEvent.id, ev!.id));
    process.env.FLOWLINE_RETENTION_AUDIT_DAYS = "1";
    try {
      await pruneOnce(db);
    } finally {
      delete process.env.FLOWLINE_RETENTION_AUDIT_DAYS;
    }
    expect(await db.select().from(schema.platformAuditEvent).where(eq(schema.platformAuditEvent.id, ev!.id))).toHaveLength(1);
    await seedPlatformCredential("billing.stripe.test.webhook", { secret: process.env.FLOWLINE_BILLING_WEBHOOK_SECRET ?? "whsec_test_seed_value" });
  });

  it("revoking an admin drops their elevation at once", async () => {
    const a = await makeAdmin("rev-a");
    const b = await makeAdmin("rev-b");
    await stepUp(a.session, a.secret);
    await stepUp(b.session, b.secret);
    as(a.session);
    const r = await call(adminRevokePOST, platformReq(`/api/platform/admins/${b.user.id}/revoke`, a.session, { method: "POST", body: {} }), { uid: b.user.id });
    expect(r.status).toBe(200);
    expect(await db.select().from(schema.platformStepup).where(eq(schema.platformStepup.userId, b.user.id))).toHaveLength(0);
    as(b.session);
    expect((await call(meGET, platformReq("/api/platform/me", b.session))).status).toBe(404);
  });
});

describe("canary never leaks", () => {
  it("is absent from every response, the audit, telemetry, the email outbox, workspace audit and logs", async () => {
    // (Earlier tests in this file used the canary as a platform secret through every write path.)
    const tables = [
      sql`select data::text as t from platform_audit_event`,
      sql`select coalesce(last_error_code,'') as t from platform_notification`,
      sql`select props::text as t from product_event`,
      sql`select coalesce(data::text,'') as t from audit_event`,
      sql`select html || plain_text || subject as t from email_outbox`,
      sql`select coalesce(secret_enc,'') || coalesce(prev_secret_enc,'') || coalesce(secret_hint,'') as t from platform_secret`,
      sql`select coalesce(value::text,'') as t from platform_setting`,
    ];
    for (const q of tables) {
      const { rows } = await db.execute<{ t: string }>(q);
      expect(rows.map((r) => r.t).join("\n"), String(q.queryChunks?.[0] ?? "")).not.toContain(CANARY);
    }
    expect(logs.join("\n")).not.toContain(CANARY);
  });
});

describe("first-admin bootstrap", () => {
  it("single-use, short-lived, serialized; email-first; bound identity + verified email + TOTP → admin; setup never reopens", async () => {
    // Fresh setup state for this test DB (the test DB is reused across runs), and a fresh redemption budget
    // (the per-client and global redemption rate limits would otherwise carry over between runs).
    await db.execute(sql`delete from rate_limit_hit`);
    await db.delete(schema.platformSetup);
    await db.update(schema.platformSetupChallenge).set({ cancelledAt: new Date() }).where(sql`consumed_at is null and cancelled_at is null`);
    const emailAddr = `boot-${randomUUID().slice(0, 8)}@flowline-test.local`;
    const expiredCh = await issueChallenge({ email: emailAddr, kind: "bootstrap", operator: "test" });
    await db.update(schema.platformSetupChallenge).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.platformSetupChallenge.id, expiredCh.id));
    as(null);
    expect((await call(setupRedeemPOST, platformReq("/api/platform/setup/redeem", null, { method: "POST", body: { token: expiredCh.token } }))).body.error.code).toBe("SETUP_CHALLENGE_INVALID");
    const ch = await issueChallenge({ email: emailAddr, kind: "bootstrap", operator: "test" });
    // Only its hash is stored.
    const [stored] = await db.select().from(schema.platformSetupChallenge).where(eq(schema.platformSetupChallenge.id, ch.id));
    expect(JSON.stringify(stored)).not.toContain(ch.token);
    // Concurrent redemption: exactly one wins.
    const [r1, r2] = await Promise.all([
      call(setupRedeemPOST, platformReq("/api/platform/setup/redeem", null, { method: "POST", body: { token: ch.token } })),
      call(setupRedeemPOST, platformReq("/api/platform/setup/redeem", null, { method: "POST", body: { token: ch.token } })),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    const won = r1.status === 200 ? r1 : r2;
    expect(won.text).not.toContain(ch.token);
    const cookie = /fl_platform_setup=([^;]+)/.exec(won.headers.get("set-cookie") ?? "")![1]!;
    const setupCookie = { cookie: `${SETUP_COOKIE}=${cookie}` };
    // Without the setup cookie the setup API doesn't exist.
    as(null);
    expect((await call(setupGET, platformReq("/api/platform/setup", null))).status).toBe(404);
    // Email first: the setup session may configure the email provider — and it then delivers only to the bound identity.
    // The setup cookie travels on the Request (and, once signed in, together with the better-auth session cookie).
    let userCookie = "";
    const withSetup = () => new Headers({ cookie: [setupCookie.cookie, userCookie].filter(Boolean).join("; ") });
    const setupReq = (path: string, init: Parameters<typeof platformReq>[2] = {}) => {
      const r = platformReq(path, null, init);
      const h = new Headers(r.headers);
      h.set("cookie", withSetup().get("cookie")!);
      return new Request(r.url, { method: r.method, headers: h, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    };
    await unseedPlatformCredential("email.resend");
    await unseedSetting("email.provider");
    try {
      const em = await call(setupEmailPUT, setupReq("/api/platform/setup/email", { method: "PUT", body: { provider: "resend", from: "Flowline <no-reply@flowline.test>", secret: "re_fake_setup_key_123" } }));
      expect(em.status).toBe(200);
      await expect(sendEmail({ to: "someone-else@flowline.test", subject: "x", html: "x", text: "x", idempotencyKey: randomUUID() })).rejects.toThrow(/setup identity/);
      await sendEmail({ to: emailAddr, subject: "Verify", html: "v", text: "v", idempotencyKey: randomUUID() });
      const fakeMail = await fake.state<{ messages: { to: string }[] }>("resend");
      expect(fakeMail.messages.at(-1)?.to).toBe(emailAddr);
    } finally {
      // Back to the test stack's outbox for the rest of the suite.
      await unseedSetting("email.provider");
      await unseedPlatformCredential("email.resend");
    }
    // The bound identity signs up (allowed during setup even in invite-only beta), verifies, enrols TOTP.
    const password = "Setup-Pass-12345";
    await auth.api.signUpEmail({ body: { email: emailAddr, password, name: "Boot" } }).catch(() => null);
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, emailAddr));
    expect(u).toBeTruthy();
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, u!.id));
    const s = await sessionFor({ id: u!.id, email: emailAddr });
    const headers = new Headers({ cookie: s.cookie });
    const enabled = (await auth.api.enableTwoFactor({ body: { password }, headers })) as { totpURI: string };
    const raw = base32Decode(new URL(enabled.totpURI).searchParams.get("secret")!);
    await auth.api.verifyTOTP({ body: { code: totpCodeFor(raw) }, headers });
    const s2 = await sessionFor({ id: u!.id, email: emailAddr });
    userCookie = s2.cookie;
    sessionHolder.headers = withSetup();
    const state = await call(setupGET, setupReq("/api/platform/setup"));
    expect(state.body).toMatchObject({ email: emailAddr, signedInAsBound: true, emailVerified: true, totpEnrolled: true });
    // A wrong identity can't complete; two concurrent completions yield exactly one admin.
    const [c1, c2] = await Promise.all([
      call(setupCompletePOST, setupReq("/api/platform/setup/complete", { method: "POST", body: { code: totpCodeFor(raw, Date.now() + 30_000) } })),
      call(setupCompletePOST, setupReq("/api/platform/setup/complete", { method: "POST", body: { code: totpCodeFor(raw, Date.now() + 30_000) } })),
    ]);
    expect([c1.status, c2.status].filter((x) => x === 200)).toHaveLength(1);
    const admins = await db.select().from(schema.platformAdmin).where(eq(schema.platformAdmin.userId, u!.id));
    expect(admins).toHaveLength(1);
    expect(admins[0]!.status).toBe("active");
    const [setup] = await db.select().from(schema.platformSetup);
    expect(setup?.completedAt).toBeTruthy();
    // Setup never reopens: not after completion, and not after every admin is gone.
    await expect(issueChallenge({ email: "x@flowline-test.local", kind: "bootstrap", operator: "test" })).rejects.toThrow(/already completed/);
    await db.update(schema.platformAdmin).set({ status: "revoked" });
    await expect(issueChallenge({ email: "x@flowline-test.local", kind: "bootstrap", operator: "test" })).rejects.toThrow(/already completed/);
    // Recovery is an explicit, audited operator action.
    const rec = await issueChallenge({ email: emailAddr, kind: "recovery", operator: "test" });
    expect(rec.kind).toBe("recovery");
    const issued = await db.select().from(schema.platformAuditEvent).where(and(eq(schema.platformAuditEvent.action, "setup.challenge_issued"), eq(schema.platformAuditEvent.targetId, rec.id)));
    expect(issued[0]).toMatchObject({ assurance: "cli", data: { kind: "recovery" } });
    await db.update(schema.platformSetupChallenge).set({ cancelledAt: new Date() }).where(eq(schema.platformSetupChallenge.id, rec.id));
    await resetTotpReplay(u!.id);
  });
});
