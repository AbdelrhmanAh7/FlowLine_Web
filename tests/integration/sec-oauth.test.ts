/**
 * Credentials in the UI — OAuth hardening and per-workspace OAuth apps (docs/security/CREDENTIALS_DESIGN.md S4, S5, S6).
 * The fake provider plays Google/Slack/GitHub (registered client ids + secrets, invalid_client, delays, echoed errors).
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => {
    throw new Error("cookies() is not used by these routes");
  },
}));

import { GET as oauthCallbackGET } from "@/app/api/oauth/callback/route";
import { DELETE as wsAppDELETE, PUT as wsAppPUT } from "@/app/api/workspaces/[wid]/oauth-apps/[family]/route";
import { GET as wsAppImpactGET } from "@/app/api/workspaces/[wid]/oauth-apps/[family]/impact/route";
import { GET as provenanceGET } from "@/app/api/workspaces/[wid]/oauth-apps/provenance/route";
import { db, schema } from "@/db";
import { completeOAuth, ConnectionError, createConnection, deleteConnection, getRuntimeCredentials, markConnectionUnhealthy, startOAuth, STATUS_REASONS } from "@/server/connections";
import { encryptSecret, sha256Hex } from "@/server/crypto";
import { resolveAppForNewAuthorization } from "@/server/oauth-apps";
import { affectedConnections, platformCredentialStatus, revokePlatformSecret, setPlatformSecret } from "@/server/platform-secrets";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { seedPlatformCredential, unseedPlatformCredential } from "../fixtures/platform-seed";
import { addMember, closeDb, expectHttpError, makeUser, unique } from "./helpers";
import { jsonOf, ORIGIN, sessionFor, type TestSession } from "./platform-helpers";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const SYSTEM = { userId: null, label: "test", assurance: "system" as const };
const CANARY = `FLCANARY_${randomUUID().replace(/-/g, "")}`;

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
  await fake.reset();
  await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
  await fake.oauthClient("google_sheets", "fake-client", ["fake-secret"]);
});
afterAll(async () => {
  await seedPlatformCredential("integration.google", { publicId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "fake-client", secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "fake-secret" });
  await fake.close();
  await closeDb();
});

function as(s: TestSession | null) {
  sessionHolder.headers = new Headers(s ? { cookie: s.cookie } : {});
}
async function call(h: unknown, req: Request, params: Record<string, string>) {
  return jsonOf(await (h as Handler)(req, { params: Promise.resolve(params) }));
}
const jsonReq = (path: string, method: string, body?: unknown, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, { method, headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

/** Follows the fake provider's auto-consent authorize redirect and returns the callback's code + state. */
async function authorize(url: string) {
  const res = await fetch(url, { redirect: "manual" });
  const loc = new URL(res.headers.get("location")!);
  return { code: loc.searchParams.get("code")!, state: loc.searchParams.get("state")!, clientId: new URL(url).searchParams.get("client_id") };
}

async function tokenPosts(provider = "google_sheets") {
  return (await fake.requests(provider)).filter((r) => r.method === "POST" && r.path === "/oauth/token").length;
}

async function team(prefix: string) {
  const owner = await makeUser(`${prefix}-owner`);
  const ws = await createWorkspace(owner, unique(prefix));
  const ownerSession = await sessionFor(owner);
  return { owner, ws, ownerSession };
}

async function connect(user: { id: string }, session: TestSession, workspaceId: string, providerId = "google_sheets") {
  const { url } = await startOAuth(db, { userId: user.id, sessionToken: session.token, workspaceId, providerId });
  const a = await authorize(url);
  const r = await completeOAuth(db, { state: a.state, code: a.code, userId: user.id, sessionToken: session.token });
  return { ...r, clientId: a.clientId };
}

async function conn(id: string) {
  const [c] = await db.select().from(schema.connection).where(eq(schema.connection.id, id));
  return c!;
}

async function expire(id: string) {
  await db.update(schema.connection).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.connection.id, id));
}

async function flowUsing(workspaceId: string, connectionId: string) {
  const [f] = await db
    .insert(schema.flow)
    .values({ workspaceId, name: unique("uses"), graph: { nodes: [{ id: "a", type: "action", position: { x: 0, y: 0 }, data: { config: { connectionId } } }], edges: [] } as never })
    .returning();
  return f!.id;
}
async function paused(flowId: string) {
  const [f] = await db.select({ p: schema.flow.pausedReason }).from(schema.flow).where(eq(schema.flow.id, flowId));
  return f!.p;
}
const creds = (c: { id: string; workspaceId: string; provider: string }) => getRuntimeCredentials(db, { connectionId: c.id, workspaceId: c.workspaceId, providerId: c.provider, requiredScopes: [] });

describe("OAuth state binding and callback re-checks", () => {
  it("state is hashed and bound to user + session; wrong session/user, replay and expiry are refused before any token exchange", async () => {
    const { owner, ws, ownerSession } = await team("state");
    const { url } = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
    const a = await authorize(url);
    expect(await db.select().from(schema.oauthState).where(eq(schema.oauthState.state, a.state))).toHaveLength(0); // raw state never stored
    const [st] = await db.select().from(schema.oauthState).where(eq(schema.oauthState.state, sha256Hex(a.state)));
    expect(st).toMatchObject({ appSource: "platform", clientId: "fake-client", sessionHash: sha256Hex(ownerSession.token), redirectUri: `${process.env.FLOWLINE_PUBLIC_URL?.replace(/\/$/, "")}/api/oauth/callback` });
    expect(st!.codeVerifierEnc).toMatch(/"ciphertext":"v2\.a256gcm-kw\./);
    const before = await tokenPosts();
    const other = await makeUser("state-other");
    await expectHttpError(completeOAuth(db, { state: a.state, code: a.code, userId: owner.id, sessionToken: "another-session" }), 403, "OAUTH_STATE_INVALID");
    await expectHttpError(completeOAuth(db, { state: a.state, code: a.code, userId: other.id, sessionToken: ownerSession.token }), 403, "OAUTH_STATE_INVALID");
    expect(await tokenPosts()).toBe(before);
    await completeOAuth(db, { state: a.state, code: a.code, userId: owner.id, sessionToken: ownerSession.token });
    await expectHttpError(completeOAuth(db, { state: a.state, code: a.code, userId: owner.id, sessionToken: ownerSession.token }), 400, "OAUTH_STATE_INVALID");
    const late = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
    const b = await authorize(late.url);
    await db.update(schema.oauthState).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.oauthState.state, sha256Hex(b.state)));
    await expectHttpError(completeOAuth(db, { state: b.state, code: b.code, userId: owner.id, sessionToken: ownerSession.token }), 400, "OAUTH_STATE_INVALID");
  });

  it("a callback after the member was removed (or downgraded) is refused before the exchange", async () => {
    const { ws } = await team("member");
    const editor = await makeUser("member-editor");
    await addMember(ws.id, editor.id, "editor");
    const s = await sessionFor(editor);
    const { url } = await startOAuth(db, { userId: editor.id, sessionToken: s.token, workspaceId: ws.id, providerId: "google_sheets" });
    const a = await authorize(url);
    await db.delete(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, editor.id)));
    const before = await tokenPosts();
    await expectHttpError(completeOAuth(db, { state: a.state, code: a.code, userId: editor.id, sessionToken: s.token }), 403, "OAUTH_ACCESS_REVOKED");
    expect(await tokenPosts()).toBe(before);
    await addMember(ws.id, editor.id, "viewer");
    const again = await startOAuth(db, { userId: editor.id, sessionToken: s.token, workspaceId: ws.id, providerId: "google_sheets" }).catch(() => null);
    expect(again).toBeTruthy(); // service-level start; the route itself requires integration.manage
    const b = await authorize(again!.url);
    await expectHttpError(completeOAuth(db, { state: b.state, code: b.code, userId: editor.id, sessionToken: s.token }), 403, "OAUTH_ACCESS_REVOKED");
  });

  it("the connection records its ISSUING app, and a real Connect verifies exactly that app revision", async () => {
    const { owner, ws, ownerSession } = await team("issuing");
    const r = await connect(owner, ownerSession, ws.id);
    const c = await conn(r.connectionId);
    expect(c).toMatchObject({ oauthAppSource: "platform", oauthAppId: null, oauthClientId: "fake-client", legacyCrypto: false });
    expect(c.secretEnc.startsWith("v2.a256gcm-kw.")).toBe(true);
    const [p] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, "integration.google"));
    expect(p).toMatchObject({ status: "verified", verifiedRevision: p!.revision, verifiedVia: "connect" });
  });

  it("provider error text is never reflected into responses, redirect URLs or stored reasons", async () => {
    const { owner, ws, ownerSession } = await team("reflect");
    const { url } = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
    const a = await authorize(url);
    await fake.oauthError("google_sheets", "invalid_request", `bad things ${CANARY}`);
    as(ownerSession);
    const res = await (oauthCallbackGET as (r: Request) => Promise<Response>)(new Request(`${ORIGIN}/api/oauth/callback?state=${encodeURIComponent(a.state)}&code=${encodeURIComponent(a.code)}`));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("code=OAUTH_EXCHANGE_FAILED");
    expect(loc).not.toContain(CANARY);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const denied = await (oauthCallbackGET as (r: Request) => Promise<Response>)(new Request(`${ORIGIN}/api/oauth/callback?error=access_denied&error_description=${CANARY}&state=x`));
    expect(denied.headers.get("location")).toContain("code=PROVIDER_DENIED");
    expect(denied.headers.get("location")).not.toContain(CANARY);
    // A refused refresh stores a fixed reason, not the provider's description.
    const r = await connect(owner, ownerSession, ws.id);
    await expire(r.connectionId);
    await fake.oauthError("google_sheets", "invalid_grant", `refresh denied ${CANARY}`);
    await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
    const c = await conn(r.connectionId);
    expect(c.statusReason).toBe(STATUS_REASONS.refresh_refused);
    const { rows } = await db.execute<{ t: string }>(sql`select coalesce(status_reason,'') || coalesce(data::text,'') as t from connection left join audit_event on audit_event.target_id = connection.id::text where connection.workspace_id = ${ws.id}`);
    expect(rows.map((x) => x.t).join()).not.toContain(CANARY);
  });
});

describe("rotation, client-auth failures and revocation", () => {
  it("rotating the platform app needs no restart of a SEPARATE worker process, and pauses nothing (grace window covers a lagging provider)", async () => {
    const { owner, ws, ownerSession } = await team("rotate");
    const r = await connect(owner, ownerSession, ws.id);
    const flowId = await flowUsing(ws.id, r.connectionId);
    const child: ChildProcessWithoutNullStreams = spawn("npx tsx tests/fixtures/refresh-child.ts", { shell: true, env: process.env });
    const lines = createInterface({ input: child.stdout });
    const queue: string[] = [];
    const waiters: ((l: string) => void)[] = [];
    lines.on("line", (l) => {
      if (!l.startsWith("{")) return;
      const w = waiters.shift();
      if (w) w(l);
      else queue.push(l);
    });
    const next = () => new Promise<Record<string, unknown>>((res) => {
      const q = queue.shift();
      if (q) return res(JSON.parse(q));
      waiters.push((l) => res(JSON.parse(l)));
    });
    try {
      expect((await next()).ready).toBe(true);
      const ask = async () => {
        await expire(r.connectionId);
        child.stdin.write(`${r.connectionId} ${ws.id} google_sheets\n`);
        return next();
      };
      expect(await ask()).toMatchObject({ ok: true });
      // The admin rotates the secret of the SAME app (Google keeps the previous one valid for the grace window).
      const status = await platformCredentialStatus("integration.google");
      await setPlatformSecret(SYSTEM, "integration.google", { secret: "fake-secret-rotated", expectedRevision: status!.revision });
      await fake.oauthClient("google_sheets", "fake-client", ["fake-secret-rotated"]);
      expect(await ask()).toMatchObject({ ok: true }); // the running process uses the new secret — no restart
      // The provider still only knows the OLD secret (rotation not yet saved there): current fails, previous works.
      await fake.oauthClient("google_sheets", "fake-client", ["fake-secret"]);
      expect(await ask()).toMatchObject({ ok: true });
      const c = await conn(r.connectionId);
      expect(c.status).toBe("active");
      expect(await paused(flowId)).toBeNull();
    } finally {
      child.stdin.end();
      child.kill();
      await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
      await fake.oauthClient("google_sheets", "fake-client", ["fake-secret"]);
    }
  });

  it("invalid_client is the APP's failure, not the user's: the step fails, the connection stays active, nothing pauses, admins are alerted", async () => {
    const { owner, ws, ownerSession } = await team("clientauth");
    const r = await connect(owner, ownerSession, ws.id);
    const flowId = await flowUsing(ws.id, r.connectionId);
    await fake.oauthClient("google_sheets", "fake-client", ["a-secret-nobody-has"]);
    try {
      await expire(r.connectionId);
      const err = await creds(await conn(r.connectionId)).catch((e) => e);
      expect(err).toBeInstanceOf(ConnectionError);
      expect((err as ConnectionError).code).toBe("CONNECTION_PROVIDER");
      const c = await conn(r.connectionId);
      expect(c.status).toBe("active");
      expect(c.statusReason).toBeNull();
      expect(await paused(flowId)).toBeNull();
      const [p] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, "integration.google"));
      expect(p!.status).toBe("rejected");
      const ev = await db.select().from(schema.platformAuditEvent).where(and(eq(schema.platformAuditEvent.action, "platform_secret.rejected_by_provider"), eq(schema.platformAuditEvent.purpose, "integration.google")));
      expect(ev.length).toBeGreaterThan(0);
    } finally {
      await fake.oauthClient("google_sheets", "fake-client", ["fake-secret"]);
    }
  });

  it("refresh vs revoke races never resurrect an active connection (connection revoke and app revoke)", async () => {
    const { owner, ws, ownerSession } = await team("race");
    // (a) The connection is revoked while its refresh is in flight: the revoke waits for the row lock and wins.
    const a = await connect(owner, ownerSession, ws.id);
    await expire(a.connectionId);
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "delay", delayMs: 1500 });
    const refreshing = creds(await conn(a.connectionId));
    await new Promise((res) => setTimeout(res, 300));
    const revoking = markConnectionUnhealthy(db, a.connectionId, "revoked", "revoked while refreshing");
    await Promise.allSettled([refreshing, revoking]);
    expect((await conn(a.connectionId)).status).toBe("revoked");
    await expect(creds(await conn(a.connectionId))).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });
    // (b) The APP is revoked while a refresh is in flight: the fence discards the new tokens; never active again.
    const b = await connect(owner, ownerSession, ws.id);
    await expire(b.connectionId);
    const versionBefore = (await conn(b.connectionId)).credVersion;
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "delay", delayMs: 1500 });
    const inflight = creds(await conn(b.connectionId)).catch((e) => e);
    await new Promise((res) => setTimeout(res, 300));
    const st = await platformCredentialStatus("integration.google");
    await revokePlatformSecret(SYSTEM, "integration.google", st!.revision);
    const out = await inflight;
    expect(out).toBeInstanceOf(ConnectionError);
    const after = await conn(b.connectionId);
    expect(after.status).not.toBe("active");
    expect(after.credVersion).toBe(versionBefore); // the refreshed tokens were never written
    await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
  });

  it("switching the platform app's client id expires exactly the connections it issued (and pauses only their flows)", async () => {
    const { owner, ws, ownerSession } = await team("switch");
    const g1 = await connect(owner, ownerSession, ws.id);
    const g2 = await connect(owner, ownerSession, ws.id);
    const slack = await createConnection(db, owner.id, ws.id, "slack", "slack (pasted)", { token: "test-token" });
    const [f1, f2, f3] = [await flowUsing(ws.id, g1.connectionId), await flowUsing(ws.id, g2.connectionId), await flowUsing(ws.id, slack.id)];
    const affected = await affectedConnections("integration.google");
    expect(affected).toBeGreaterThanOrEqual(2);
    const st = await platformCredentialStatus("integration.google");
    await setPlatformSecret(SYSTEM, "integration.google", { publicId: "fake-client-2", secret: "fake-secret-2", expectedRevision: st!.revision });
    try {
      for (const id of [g1.connectionId, g2.connectionId]) expect(await conn(id)).toMatchObject({ status: "expired", statusReason: STATUS_REASONS.oauth_app_changed });
      expect((await conn(slack.id)).status).toBe("active");
      expect(await paused(f1)).toMatch(/^connection:/);
      expect(await paused(f2)).toMatch(/^connection:/);
      expect(await paused(f3)).toBeNull();
      // New authorizations use the new app.
      const { url } = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
      expect(new URL(url).searchParams.get("client_id")).toBe("fake-client-2");
    } finally {
      await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
    }
  });

  it("a legacy OAuth connection whose issuing app is unknown must reconnect (never guessed); v1 blobs are refused in migrated rows", async () => {
    const { owner, ws } = await team("legacy");
    const enc = encryptSecret({ type: "oauth2", token: "expired-token", refreshToken: "some-refresh", settings: {} });
    const [row] = await db
      .insert(schema.connection)
      .values({ workspaceId: ws.id, provider: "google_sheets", label: "legacy", authType: "oauth2", accountId: "acct", accountLabel: "acct", scopes: [], secretEnc: enc.ciphertext, keyId: enc.keyId, legacyCrypto: true, accessExpiresAt: new Date(Date.now() - 1000), createdBy: owner.id })
      .returning();
    await expect(creds(row!)).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
    expect((await conn(row!.id)).statusReason).toBe(STATUS_REASONS.oauth_app_unknown);
    // Planting a v1 (no-AAD) blob into a migrated row is refused — no downgrade path around the AAD.
    const ok = await createConnection(db, owner.id, ws.id, "slack", "slack v2", { token: "test-token" });
    await db.update(schema.connection).set({ secretEnc: enc.ciphertext, keyId: enc.keyId }).where(eq(schema.connection.id, ok.id));
    await expect(creds({ id: ok.id, workspaceId: ws.id, provider: "slack" })).rejects.toThrow(/Legacy ciphertext refused/);
    // …and a v2 blob copied from another row doesn't decrypt either (AAD row binding).
    const other = await createConnection(db, owner.id, ws.id, "slack", "slack other", { token: "test-token" });
    const [src] = await db.select().from(schema.connection).where(eq(schema.connection.id, other.id));
    await db.update(schema.connection).set({ secretEnc: src!.secretEnc, keyId: src!.keyId }).where(eq(schema.connection.id, ok.id));
    await expect(creds({ id: ok.id, workspaceId: ws.id, provider: "slack" })).rejects.toThrow();
  });

  it("GitHub revocation uses its own adapter (the app's basic auth), and the outcome is reported honestly", async () => {
    await seedPlatformCredential("integration.github", { publicId: "gh-fake-client", secret: "gh-fake-secret" });
    await fake.oauthClient("github", "gh-fake-client", ["gh-fake-secret"]);
    try {
      const { owner, ws, ownerSession } = await team("ghrevoke");
      const r = await connect(owner, ownerSession, ws.id, "github");
      const { creds: c } = await creds(await conn(r.connectionId));
      expect((await fetch(`${fake.url}/github/user`, { headers: { authorization: `Bearer ${c.token}` } })).status).toBe(200);
      const out = await deleteConnection(db, ws.id, r.connectionId);
      expect(out.remoteRevocation).toBe("revoked");
      expect((await fetch(`${fake.url}/github/user`, { headers: { authorization: `Bearer ${c.token}` } })).status).toBe(401);
    } finally {
      await fake.oauthClient("github", "gh-fake-client", []);
      await unseedPlatformCredential("integration.github");
    }
  });
});

describe("per-workspace OAuth app override (owner-only)", () => {
  it("owner-only config; members see provenance before consent; new Connects use it; existing connections keep their issuing app; delete expires exactly its connections", async () => {
    const { owner, ws, ownerSession } = await team("override");
    const editor = await makeUser("override-editor");
    await addMember(ws.id, editor.id, "editor");
    const editorSession = await sessionFor(editor);
    const stranger = await sessionFor(await makeUser("override-stranger"));
    // An existing connection issued by Flowline's app, before the override.
    const platformConn = await connect(owner, ownerSession, ws.id);
    const body = { clientId: "ws-own-client", secret: "ws-own-secret-value", expectedRevision: 0 };
    as(editorSession);
    expect((await call(wsAppPUT, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "PUT", body), { wid: ws.id, family: "google" })).status).toBe(403);
    as(stranger);
    expect((await call(wsAppPUT, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "PUT", body), { wid: ws.id, family: "google" })).status).toBe(404);
    as(ownerSession);
    // Secret-management writes need the exact configured Origin (missing / foreign origins are refused).
    expect((await call(wsAppPUT, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "PUT", body, null), { wid: ws.id, family: "google" })).body.error.code).toBe("CROSS_SITE_REQUEST");
    expect((await call(wsAppPUT, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "PUT", body, "https://evil.example"), { wid: ws.id, family: "google" })).body.error.code).toBe("CROSS_SITE_REQUEST");
    const empty = await call(wsAppPUT, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "PUT", { ...body, secret: "" }), { wid: ws.id, family: "google" });
    expect(empty.status).toBe(400);
    const saved = await call(wsAppPUT, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "PUT", body), { wid: ws.id, family: "google" });
    expect(saved.status).toBe(200);
    expect(saved.text).not.toContain("ws-own-secret-value");
    expect(saved.body.app).toMatchObject({ clientId: "ws-own-client", configured: true, status: "configured_unverified" });
    // Provenance, shown to a member before the redirect.
    as(editorSession);
    const prov = await call(provenanceGET, new Request(`${ORIGIN}/api/workspaces/${ws.id}/oauth-apps/provenance?provider=google_sheets`), { wid: ws.id });
    expect(prov.body.app).toMatchObject({ source: "workspace", clientId: "ws-own-client", configuredBy: owner.email, verified: false });
    // A new Connect uses the workspace's own app (its client id and its secret).
    await fake.oauthClient("google_sheets", "ws-own-client", ["ws-own-secret-value"]);
    const own = await connect(editor, editorSession, ws.id);
    expect(own.clientId).toBe("ws-own-client");
    const ownConn = await conn(own.connectionId);
    expect(ownConn.oauthAppSource).toBe("workspace");
    expect(ownConn.oauthClientId).toBe("ws-own-client");
    // The pre-existing connection still refreshes with Flowline's app (a default change affects new authorizations
    // only): with the workspace app unknown to the provider, its refresh can only succeed with Flowline's client.
    await fake.oauthClient("google_sheets", "ws-own-client", []);
    await expire(platformConn.connectionId);
    const before = (await fake.requests("google_sheets")).length;
    await creds(await conn(platformConn.connectionId));
    const refreshPost = (await fake.requests("google_sheets")).slice(before).find((r) => r.path === "/oauth/token");
    expect(refreshPost).toBeTruthy();
    expect(await conn(platformConn.connectionId)).toMatchObject({ status: "active", oauthAppSource: "platform", oauthClientId: "fake-client" });
    await fake.oauthClient("google_sheets", "ws-own-client", ["ws-own-secret-value"]);
    // AAD: the workspace app's ciphertext copied to another workspace's app row doesn't decrypt there.
    const other = await team("override-other");
    as(other.ownerSession);
    await call(wsAppPUT, jsonReq(`/api/workspaces/${other.ws.id}/oauth-apps/google`, "PUT", { clientId: "other-client", secret: "other-secret-value", expectedRevision: 0 }), { wid: other.ws.id, family: "google" });
    const [mine] = await db.select().from(schema.workspaceOauthApp).where(and(eq(schema.workspaceOauthApp.workspaceId, ws.id), sql`deleted_at is null`));
    await db.update(schema.workspaceOauthApp).set({ secretEnc: mine!.secretEnc, keyId: mine!.keyId }).where(eq(schema.workspaceOauthApp.workspaceId, other.ws.id));
    await expect(resolveAppForNewAuthorization(other.ws.id, "google_sheets")).rejects.toThrow();
    // Delete: the owner sees the exact impact first; exactly its connections must reconnect; nothing moves to Flowline's app.
    as(ownerSession);
    const impact = await call(wsAppImpactGET, new Request(`${ORIGIN}/api/workspaces/${ws.id}/oauth-apps/google/impact`), { wid: ws.id, family: "google" });
    expect(impact.body.affectedConnections).toBe(1);
    const del = await call(wsAppDELETE, jsonReq(`/api/workspaces/${ws.id}/oauth-apps/google`, "DELETE", { expectedRevision: 1 }), { wid: ws.id, family: "google" });
    expect(del.body.affectedConnections).toBe(1);
    expect(await conn(own.connectionId)).toMatchObject({ status: "expired", statusReason: STATUS_REASONS.oauth_app_deleted, oauthAppSource: "workspace" });
    expect((await conn(platformConn.connectionId)).status).toBe("active");
    const audit = await db.select({ action: schema.auditEvent.action, data: schema.auditEvent.data }).from(schema.auditEvent).where(eq(schema.auditEvent.workspaceId, ws.id));
    expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(["oauth_app.configured", "oauth_app.verified", "oauth_app.deleted"]));
    expect(audit.find((e) => e.action === "oauth_app.deleted")?.data).toMatchObject({ affectedConnections: 1, clientId: "ws-own-client" });
    expect(JSON.stringify(audit)).not.toContain("ws-own-secret-value");
    await fake.oauthClient("google_sheets", "ws-own-client", []);
  });
});
