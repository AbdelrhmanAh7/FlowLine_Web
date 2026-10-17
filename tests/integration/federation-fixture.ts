import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { expect } from "vitest";
import { db, schema } from "@/db";
import * as egress from "@/server/egress";
import { saveSsoConfig, startSso, completeSso } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { makeVerifiedUser, sessionFor } from "./platform-helpers";
import { sendSsoLinkVerification, ssoLinkDetails } from "@/server/sso-link";
import { POST as emailPOST } from "@/app/api/email/route";

export async function consumeMailboxLink(email: string, path = "/verify-email", tokenId?: string) {
  const messages = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, email)).orderBy(schema.emailOutbox.createdAt);
  const mail = messages.filter((m) => m.plainText.includes(path) && (!tokenId || m.idempotencyKey === tokenId)).at(-1);
  expect(mail).toBeDefined();
  const token = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(mail!.plainText)?.[1];
  expect(token).toBeTruthy();
  const origin = process.env.FLOWLINE_PUBLIC_URL!;
  const res = await emailPOST(new Request(`${origin}/api/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ action: path === "/verify-email" ? "verify" : "reset", token, ...(path === "/reset-password" ? { password: "recovered-password-123" } : {}) }) }), undefined);
  expect(res.status).toBe(200);
  expect((await res.json()).status).toBe("done");
}
export async function proveSsoMailbox(token: string, session: Awaited<ReturnType<typeof sessionFor>>) {
  await sendSsoLinkVerification(token, session.token);
  const { intent } = await ssoLinkDetails(token, session.token);
  await consumeMailboxLink(session.email, "/verify-email", intent.mailboxTokenId);
}

/** Signed malicious-IdP responses, delivered entirely in memory. No HTTP server or browser. */
export const ISSUER = "https://tenant-idp.example";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-rsa", alg: "RS256" }] };
export function signedToken(claims: Record<string, unknown>) {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-rsa" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url")}`;
}
const issued = new Map<string, string>();
export function mockTenantIdp() {
  return vi.spyOn(egress, "safeFetch").mockImplementation(async (url, opts) => {
    const u = new URL(String(url));
    let body: unknown;
    if (u.pathname.endsWith("openid-configuration")) body = { issuer: u.origin, authorization_endpoint: `${u.origin}/authorize`, token_endpoint: `${u.origin}/token`, jwks_uri: `${u.origin}/jwks`, token_endpoint_auth_methods_supported: ["client_secret_basic"] };
    else if (u.pathname === "/jwks") body = jwks;
    else if (u.pathname === "/token") body = { id_token: issued.get(new URLSearchParams(String(opts?.body)).get("code") ?? "") };
    else throw new Error(`Unexpected in-memory IdP request: ${u.pathname}`);
    return { status: 200, json: () => body } as Awaited<ReturnType<typeof egress.safeFetch>>;
  });
}
export async function configuredTenant() {
  const owner = await makeVerifiedUser("malicious-owner");
  const ws = await createWorkspace(owner, `Security-${randomUUID().slice(0, 8)}`);
  await saveSsoConfig(owner, ws.id, { issuer: ISSUER, clientId: "test-client", clientSecret: "synthetic", domains: ["flowline-test.local"], defaultRole: "viewer", enabled: false });
  // Fixture models an already test-verified attacker-controlled provider.
  await db.update(schema.ssoConfig).set({ verifiedAt: new Date(), enabled: true }).where(eq(schema.ssoConfig.workspaceId, ws.id));
  return { owner, ws };
}
export async function oidcAttempt(slug: string, email: string, session?: Awaited<ReturnType<typeof sessionFor>>, subject = "attacker-subject") {
  const user = session ? { id: session.userId, email: session.email, name: "Test" } : null;
  const started = await startSso({ slug, user, sessionToken: session?.token });
  const [state] = await db.select().from(schema.ssoState).where(eq(schema.ssoState.state, started.state));
  const code = randomUUID();
  issued.set(code, signedToken({ iss: new URL(started.url).origin, sub: subject, aud: "test-client", nonce: state!.nonce, exp: Math.floor(Date.now() / 1000) + 300, email, email_verified: true }));
  return { state: started.state, code, sessionToken: session?.token };
}
export async function oidcSignIn(slug: string, email: string, session?: Awaited<ReturnType<typeof sessionFor>>, subject?: string) {
  return completeSso(await oidcAttempt(slug, email, session, subject));
}
