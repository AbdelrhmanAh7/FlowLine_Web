/**
 * Sign-in apps as platform credentials: live rotation with NO restart (revision-keyed better-auth factory with a
 * request-local snapshot) and callbacks bound to the initiating revision (owner decision 2; CREDENTIALS_DESIGN S3/S6).
 * Also: accounts with an authenticator finish email sign-in with a TOTP code.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET as authConfigGET } from "@/app/api/auth-config/route";
import { db, schema } from "@/db";
import { dispatchAuth, instanceForCallback } from "@/server/auth-dispatch";
import { sha256Hex } from "@/server/crypto";
import { platformCredentialStatus, revokePlatformSecret, setPlatformSecret } from "@/server/platform-secrets";
import { seedPlatformCredential, unseedPlatformCredential } from "../fixtures/platform-seed";
import { closeDb } from "./helpers";
import { code, enrolTotp, makeVerifiedUser, ORIGIN } from "./platform-helpers";

const SYSTEM = { userId: null, label: "test", assurance: "system" as const };
afterAll(async () => {
  await unseedPlatformCredential("signin.google");
  await closeDb();
});

async function startSocial(provider: "google" | "github") {
  const res = await dispatchAuth(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ provider, callbackURL: "/app" }) }), "POST");
  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url ? new URL(body.url) : null;
  return { status: res.status, clientId: url?.searchParams.get("client_id") ?? null, state: url?.searchParams.get("state") ?? null };
}

async function availability() {
  return (await (await authConfigGET(new Request(`${ORIGIN}/api/auth-config`))).json()) as { google: boolean; github: boolean };
}

describe("sign-in app rotation without restart", () => {
  it("every request uses the CURRENT sign-in app; a callback is dispatched only with the revision that started it", async () => {
    await unseedPlatformCredential("signin.google");
    expect((await availability()).google).toBe(false);
    await seedPlatformCredential("signin.google", { publicId: "g-signin-client-1", secret: "g-signin-secret-1" });
    expect((await availability()).google).toBe(true);
    const first = await startSocial("google");
    expect(first.status).toBe(200);
    expect(first.clientId).toBe("g-signin-client-1");
    const r1 = (await platformCredentialStatus("signin.google"))!.revision;
    const [attempt] = await db.select().from(schema.signinAttempt).where(eq(schema.signinAttempt.stateHash, sha256Hex(first.state!)));
    expect(attempt).toMatchObject({ provider: "google", revision: r1 });

    // Rotate the secret of the same app: the next request uses the new revision, the pending callback keeps r1 (grace).
    await setPlatformSecret(SYSTEM, "signin.google", { secret: "g-signin-secret-2", expectedRevision: r1 });
    const second = await startSocial("google");
    expect(second.clientId).toBe("g-signin-client-1");
    expect((await instanceForCallback("google", first.state))?.revision).toBe(r1);
    expect((await instanceForCallback("google", second.state))?.revision).toBe(r1 + 1);

    // Switch to a different app: new requests use it at once; callbacks of the old app are refused (never guessed).
    await setPlatformSecret(SYSTEM, "signin.google", { publicId: "g-signin-client-2", secret: "g-signin-secret-3", expectedRevision: r1 + 1 });
    const third = await startSocial("google");
    expect(third.clientId).toBe("g-signin-client-2");
    expect(await instanceForCallback("google", first.state)).toBeNull();
    expect(await instanceForCallback("google", second.state)).toBeNull();
    expect((await instanceForCallback("google", third.state))?.revision).toBe(r1 + 2);
    // A callback query can't select credentials: unknown state → refused with a bounded error, no Referer leak.
    const cb = await dispatchAuth(new Request(`${ORIGIN}/api/auth/callback/google?state=not-a-real-state&code=x`), "GET");
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toContain("/sign-in?error=signin_expired");
    expect(cb.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await instanceForCallback("github", third.state)).toBeNull(); // bound to its provider too

    // Revoke: availability and pending callbacks fail closed immediately (even though GOOGLE_CLIENT_* may be set in env).
    await revokePlatformSecret(SYSTEM, "signin.google", r1 + 2);
    expect((await availability()).google).toBe(false);
    expect(await instanceForCallback("google", third.state)).toBeNull();
    const refused = await startSocial("google");
    expect(refused.clientId).toBeNull();
  });
});

describe("social-login tokens at rest", () => {
  it("better-auth's own account writes store v2 envelopes (row + field bound) and read back decrypted; nothing plaintext in the table", async () => {
    const { auth } = await import("@/lib/auth");
    const ctx = await auth.$context;
    const user = await makeVerifiedUser("social-tokens");
    const canary = `FLCANARY_${randomUUID()}`;
    const created = await ctx.internalAdapter.createAccount({ userId: user.id, providerId: "google", accountId: `g-${randomUUID()}`, accessToken: `ya29.${canary}`, refreshToken: `1//${canary}`, idToken: `eyJ.${canary}` });
    expect(created.accessToken).toBe(`ya29.${canary}`);
    const [raw] = await db.select().from(schema.account).where(eq(schema.account.id, created.id));
    for (const v of [raw!.accessToken, raw!.refreshToken, raw!.idToken]) expect(v).toMatch(/^v2\.a256gcm-kw\./);
    expect(JSON.stringify(raw)).not.toContain(canary);
    const listed = await ctx.internalAdapter.findAccounts(user.id);
    expect(listed.find((a) => a.id === created.id)?.refreshToken).toBe(`1//${canary}`);
    // Token refresh path (updateAccount) re-encrypts bound to the same row.
    await ctx.internalAdapter.updateAccount(created.id, { accessToken: `ya29.second-${canary}` });
    const [raw2] = await db.select().from(schema.account).where(eq(schema.account.id, created.id));
    expect(raw2!.accessToken).toMatch(/^v2\.a256gcm-kw\./);
    expect(raw2!.accessToken).not.toContain(canary);
    expect((await ctx.internalAdapter.findAccounts(user.id)).find((a) => a.id === created.id)?.accessToken).toBe(`ya29.second-${canary}`);
  });
});

describe("email sign-in with an authenticator", () => {
  it("returns a two-factor challenge instead of a session, then signs in with the TOTP code", async () => {
    const user = await makeVerifiedUser("totp-signin");
    const password = "Totp-Signin-12345";
    await db.insert(schema.account).values({ id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(password) });
    const secret = await enrolTotp(user.id);
    const res = await dispatchAuth(new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email: user.email, password }) }), "POST");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ twoFactorRedirect: true });
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => /session_token=[^;]+;/.test(c) && !/Max-Age=0/.test(c))).toBe(false); // no session yet
    const twoFactorCookie = cookies.map((c) => c.split(";")[0]!).filter((c) => /two_factor/.test(c)).join("; ");
    expect(twoFactorCookie).not.toBe("");
    const wrong = await dispatchAuth(new Request(`${ORIGIN}/api/auth/two-factor/verify-totp`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie: twoFactorCookie }, body: JSON.stringify({ code: code(secret) === "000000" ? "111111" : "000000" }) }), "POST");
    expect(wrong.ok).toBe(false);
    const ok = await dispatchAuth(new Request(`${ORIGIN}/api/auth/two-factor/verify-totp`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie: twoFactorCookie }, body: JSON.stringify({ code: code(secret) }) }), "POST");
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().some((c) => /session_token=/.test(c))).toBe(true);
    const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, user.id));
    expect(sessions.length).toBe(1);
    const { hasSessionMfa } = await import("@/server/federated-mfa");
    expect(await hasSessionMfa(sessions[0]!.token, user.id)).toBe(true);
  });
});
