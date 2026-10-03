import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { twoFactor } from "better-auth/plugins/two-factor";
import { symmetricEncrypt } from "better-auth/crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName, type SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  enabled: true, exists: true, factor: "encrypted-factor-1", verified: true,
  proofs: new Map<string, { value: string; expiresAt: Date }>(),
  pending: new Map<string, { id: string; identifier: string; value: string }>(),
  configStamp: "unit-config" as string | null,
}));
// Like the real stamp: only a known sign-in provider id has a configuration; anything else (such as a route
// pattern's literal ":id") has none. A stamp that ignored its argument hid the callback-provider regression.
vi.mock("@/server/auth-dispatch", () => ({ federatedProviderStamp: async (provider: string) => ["google", "github", "zitadel"].includes(provider) ? state.configStamp : null }));
vi.mock("@/db", async () => ({
  schema: await import("@/db/schema"),
  db: {
    select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: async (sql: SQL) => {
      const { params } = new PgDialect().sqlToQuery(sql);
      switch (getTableName(table)) {
        case "user": return state.exists ? [{ id: params[0], twoFactorEnabled: state.enabled, updatedAt: new Date(0) }] : [];
        case "two_factor": return [{ secret: state.factor, verified: state.verified }];
        case "account": return [];
        case "verification": {
          const proof = state.proofs.get(String(params[0]));
          return proof && proof.value === params[1] && proof.expiresAt > new Date(String(params[2])) ? [proof] : [];
        }
        default: throw new Error(`Unexpected read: ${getTableName(table)}`);
      }
    } }) }),
    insert: () => ({ values: (row: { id: string; identifier: string; value: string; expiresAt: Date }) => {
      const save = async () => {
        if (row.identifier.startsWith("federated-mfa:")) state.pending.set(row.identifier, row);
        else state.proofs.set(row.id, row);
      };
      return { then: (...args: Parameters<Promise<void>["then"]>) => save().then(...args), onConflictDoUpdate: save };
    } }),
  },
}));
import { FEDERATED_MFA_COOKIE, federatedMfa, hasSessionMfa, recordMfaAssurance } from "@/server/federated-mfa";
import { sha256Hex } from "@/server/crypto";
import { totpCodeFor } from "@/server/totp";
import { assertFederatedLinkSession } from "@/server/federated-link";

const origin = "http://localhost:3100";
const secret = "unit-test-only-auth-secret-at-least-32-characters";
async function fixture() {
  const instance = betterAuth({
    baseURL: origin, secret, database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
    emailAndPassword: { enabled: true }, session: { cookieCache: { enabled: false } },
    socialProviders: { github: { clientId: "synthetic-client", clientSecret: "synthetic-secret" } },
    databaseHooks: { account: {
      create: { before: async (_account, ctx) => { await assertFederatedLinkSession(ctx); } },
      update: { before: async (_account, ctx) => { await assertFederatedLinkSession(ctx); } },
    } },
    plugins: [twoFactor(), federatedMfa()],
    logger: { disabled: true },
  });
  const ctx = await instance.$context;
  const user = await ctx.internalAdapter.createUser({ email: "mfa@example.test", name: "MFA", emailVerified: true, twoFactorEnabled: true }, { method: "email-password" });
  const session = await ctx.internalAdapter.createSession(user.id);
  const cookie = `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${createHmac("sha256", secret).update(session.token).digest("base64")}`)}`;
  const headers = new Headers({ cookie, origin });
  return { instance, ctx, user, session, headers };
}
beforeEach(() => {
  Object.assign(state, { enabled: true, exists: true, factor: "encrypted-factor-1", verified: true, configStamp: "unit-config" });
  state.proofs.clear();
  state.pending.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("MFA fence through the installed Better Auth session middleware (no database)", () => {
  for (const mutation of ["none", "logout", "different-session", "revoked-during-exchange", "factor-replaced-during-exchange", "app-revoked-during-exchange"] as const) {
    it(`binds a real GitHub link callback to the initiating assured session: ${mutation}`, async () => {
      const { instance, ctx, user, session, headers } = await fixture();
      await recordMfaAssurance(session.token, user.id, session.expiresAt);
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.href === "https://github.com/login/oauth/access_token") {
          if (mutation === "revoked-during-exchange") await ctx.internalAdapter.deleteSession(session.token);
          if (mutation === "factor-replaced-during-exchange") state.factor = "replacement-factor";
          if (mutation === "app-revoked-during-exchange") state.configStamp = null;
          return Response.json({ access_token: "synthetic-token", token_type: "bearer", scope: "read:user,user:email" });
        }
        if (url.href === "https://api.github.com/user") return Response.json({ id: 12345, email: user.email, name: "MFA", login: "synthetic-user" });
        if (url.href === "https://api.github.com/user/emails") return Response.json([{ email: user.email, verified: true, primary: true }]);
        throw new Error(`Unexpected provider request: ${url.pathname}`);
      }));
      const start = await instance.handler(new Request(`${origin}/api/auth/link-social`, { method: "POST", headers: { ...Object.fromEntries(headers), "content-type": "application/json" }, body: JSON.stringify({ provider: "github", callbackURL: "/app", additionalData: { flowlineLinkSessionHash: "caller-controlled" } }) }));
      expect(start.status).toBe(200);
      const authorization = new URL((await start.json()).url);
      let sessionCookie = headers.get("cookie")!;
      if (mutation === "logout") await ctx.internalAdapter.deleteSession(session.token);
      if (mutation === "different-session") {
        const other = await ctx.internalAdapter.createSession(user.id);
        await recordMfaAssurance(other.token, user.id, other.expiresAt);
        sessionCookie = `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${other.token}.${createHmac("sha256", secret).update(other.token).digest("base64")}`)}`;
      }
      const cookie = `${sessionCookie}; ${start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")}`;
      const callback = await instance.handler(new Request(`${origin}/api/auth/callback/github?state=${authorization.searchParams.get("state")}&code=synthetic-code`, { headers: { cookie } }));
      const links = (await ctx.internalAdapter.findAccounts(user.id)).filter((account) => account.providerId === "github");
      expect(links).toHaveLength(mutation === "none" ? 1 : 0);
      if (mutation === "none") expect(callback.headers.get("location")).toBe("/app");
      else expect(callback.status === 401 || callback.headers.get("location")?.includes("error=")).toBe(true);
    });
  }

  for (const configured of [true, false]) it(`${configured ? "issues the pending local-factor challenge for" : "fails closed on"} an enrolled user's real GitHub sign-in callback (hooks see the route pattern, not the URL)`, async () => {
    // Regression: the hook parsed the provider out of ctx.path, which is "/callback/:id" inside Better Auth hooks.
    const { instance, ctx, user, session } = await fixture();
    await ctx.internalAdapter.createAccount({ userId: user.id, accountId: "12345", providerId: "github" });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.href === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "synthetic-token", token_type: "bearer", scope: "read:user,user:email" });
      if (url.href === "https://api.github.com/user") return Response.json({ id: 12345, email: user.email, name: "MFA", login: "synthetic-user" });
      if (url.href === "https://api.github.com/user/emails") return Response.json([{ email: user.email, verified: true, primary: true }]);
      throw new Error(`Unexpected provider request: ${url.pathname}`);
    }));
    const start = await instance.handler(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ provider: "github", callbackURL: "/app" }) }));
    expect(start.status).toBe(200);
    const authorization = new URL((await start.json()).url);
    const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!configured) state.configStamp = null; // provider revoked/replaced while the user was at the provider
    const callback = await instance.handler(new Request(`${origin}/api/auth/callback/github?state=${authorization.searchParams.get("state")}&code=synthetic-code`, { headers: { cookie } }));
    const live = (name: string) => callback.headers.getSetCookie().filter((c) => c.startsWith(`${name}=`) && !/Max-Age=0/i.test(c));
    expect(live(ctx.authCookies.sessionToken.name)).toHaveLength(0);
    // The provider session is never kept: only the pre-existing session row (created by the fixture) remains.
    const sessions = await ctx.adapter.findMany<{ token: string }>({ model: "session", where: [{ field: "userId", value: user.id }] });
    expect(sessions.map((row) => row.token)).toEqual([session.token]);
    if (!configured) {
      expect(callback.headers.get("location")).toContain("/sign-in?error=signin_expired");
      expect(live(FEDERATED_MFA_COOKIE)).toHaveLength(0);
      expect(state.pending.size).toBe(0);
      return;
    }
    expect(callback.headers.get("location")).toContain("/auth/step-up");
    expect(live(FEDERATED_MFA_COOKIE)).toHaveLength(1);
    const [pending] = [...state.pending.values()];
    expect(JSON.parse(pending!.value).global).toEqual({ provider: "github", configStamp: "unit-config" });
  });

  it("rejects pre-MFA sessions in server reads, HTTP get-session, and account linking", async () => {
    const { instance, headers } = await fixture();
    expect(await instance.api.getSession({ headers })).toBeNull();
    const res = await instance.handler(new Request(`${origin}/api/auth/get-session`, { headers }));
    expect(await res.json()).toBeNull();
    const link = await instance.handler(new Request(`${origin}/api/auth/link-social`, { method: "POST", headers: { ...Object.fromEntries(headers), "content-type": "application/json" }, body: JSON.stringify({ provider: "github", callbackURL: "/app" }) }));
    expect(link.status).toBe(401);
    const accounts = await instance.handler(new Request(`${origin}/api/auth/list-accounts`, { headers }));
    expect(accounts.status).toBe(401);
  });

  it("keeps non-enrolled sessions usable, then refuses them immediately on enrollment", async () => {
    const { instance, user, headers } = await fixture();
    state.enabled = false;
    expect((await instance.api.getSession({ headers }))?.user.id).toBe(user.id);
    state.enabled = true;
    expect(await instance.api.getSession({ headers })).toBeNull();
  });

  it("accepts assurance only for the exact session and current verified factor", async () => {
    const { instance, user, session, headers } = await fixture();
    await recordMfaAssurance("another-token", user.id, session.expiresAt);
    expect(await instance.api.getSession({ headers })).toBeNull();
    await recordMfaAssurance(session.token, user.id, session.expiresAt);
    expect((await instance.api.getSession({ headers }))?.user.id).toBe(user.id);
    state.factor = "replacement-factor";
    expect(await instance.api.getSession({ headers })).toBeNull();
    state.factor = "encrypted-factor-1";
    state.verified = false;
    expect(await instance.api.getSession({ headers })).toBeNull();
  });

  it("does not resurrect a revoked session from an assurance record", async () => {
    const { instance, ctx, user, session, headers } = await fixture();
    await recordMfaAssurance(session.token, user.id, session.expiresAt);
    await ctx.internalAdapter.deleteSession(session.token);
    expect(await instance.api.getSession({ headers })).toBeNull();
  });

  it("records assurance only after the real password/TOTP flow completes", async () => {
    const { instance, ctx, user } = await fixture();
    const password = "unit-only-password";
    const rawFactor = "unit-only-authenticator-secret";
    state.factor = await symmetricEncrypt({ key: ctx.secretConfig, data: rawFactor });
    await ctx.internalAdapter.createAccount({ userId: user.id, accountId: user.id, providerId: "credential", password: await ctx.password.hash(password) });
    await ctx.adapter.create({ model: "twoFactor", data: { userId: user.id, secret: state.factor, verified: true, backupCodes: await symmetricEncrypt({ key: ctx.secretConfig, data: "[]" }) } });
    const start = await instance.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password }) }));
    expect(start.status).toBe(200);
    expect((await start.json()).twoFactorRedirect).toBe(true);
    expect(state.proofs.size).toBe(0);
    const pendingCookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(await instance.api.getSession({ headers: new Headers({ cookie: pendingCookie }) })).toBeNull();
    const completed = await instance.handler(new Request(`${origin}/api/auth/two-factor/verify-totp`, { method: "POST", headers: { origin, cookie: pendingCookie, "content-type": "application/json" }, body: JSON.stringify({ code: totpCodeFor(rawFactor) }) }));
    expect(completed.status).toBe(200);
    const cookie = completed.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect((await instance.api.getSession({ headers: new Headers({ cookie }) }))?.user.id).toBe(user.id);
    expect(state.proofs.size).toBe(1);
  });

  it("refreshes only an assured session and never extends its MFA proof lifetime", async () => {
    const { instance, ctx, user, session, headers } = await fixture();
    await ctx.internalAdapter.updateSession(session.token, { expiresAt: new Date(Date.now() + 60_000) });
    const expiresAt = new Date(Date.now() + 60_000);
    await recordMfaAssurance(session.token, user.id, expiresAt);
    expect((await instance.api.getSession({ headers }))?.session.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());
    expect(state.proofs.get(`mfa-session:${sha256Hex(session.token)}`)?.expiresAt).toEqual(expiresAt);
    state.proofs.get(`mfa-session:${sha256Hex(session.token)}`)!.expiresAt = new Date(Date.now() - 1);
    expect(await hasSessionMfa(session.token, user.id)).toBe(false);
    expect(await instance.api.getSession({ headers })).toBeNull();
  });
});
