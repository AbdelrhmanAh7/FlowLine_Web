/**
 * CXH-01 second round (artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST-cceeb5d.md §CXH-01): the platform OAuth app's
 * identity must be IMMUTABLE. Revoke → clear → recreate with the SAME client id starts a new platform_secret row whose
 * epoch restarts at 1, so (purpose, client id, epoch) alone can't tell the replacement from the app that issued a token
 * or started an authorization. The row id is carried through oauth_state, connection provenance, the callback fence,
 * runtime validation and refresh.
 *
 * The in-flight race uses a REAL PostgreSQL lock for a controlled interleaving: the callback has consumed its state and
 * exchanged the code, then blocks (ACCESS EXCLUSIVE on workspace_member) right before its final checks + store while the
 * administrator revokes, clears and recreates the app. Blocking is proven via pg_stat_activity, not by timing.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, schema } from "@/db";
import { completeOAuth, ConnectionError, getRuntimeCredentials, startOAuth } from "@/server/connections";
import { deleteWorkspaceApp, upsertWorkspaceApp } from "@/server/oauth-apps";
import { clearPlatformSecret, platformCredentialStatus, revokePlatformSecret, setPlatformSecret } from "@/server/platform-secrets";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { seedPlatformCredential, unseedPlatformCredential } from "../fixtures/platform-seed";
import { closeDb, makeUser, unique } from "./helpers";
import { sessionFor, type TestSession } from "./platform-helpers";

const SYSTEM = { userId: null, label: "test", assurance: "system" as const };
const PURPOSE = "integration.google";

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
  await fake.reset();
  await fake.oauthClient("google_sheets", "fake-client", ["fake-secret", "fake-secret-rotated"]);
});
afterAll(async () => {
  await seedPlatformCredential(PURPOSE, { publicId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "fake-client", secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "fake-secret" });
  await fake.close();
  await closeDb();
});

/* ───────────── helpers ───────────── */

async function lockWaiters() {
  const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'");
  return rows[0]!.n;
}

async function until(cond: () => Promise<boolean> | boolean, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

async function holdLock(sqlText: string) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query(sqlText);
  return {
    async release() {
      await client.query("commit");
      client.release();
    },
  };
}

function settle<T>(p: Promise<T>) {
  const s = { done: false, value: undefined as T | undefined, error: undefined as unknown };
  const promise = p.then(
    (v) => {
      s.value = v;
      s.done = true;
    },
    (e) => {
      s.error = e;
      s.done = true;
    },
  );
  return Object.assign(s, { promise });
}

async function authorize(url: string) {
  const res = await fetch(url, { redirect: "manual" });
  const loc = new URL(res.headers.get("location")!);
  return { code: loc.searchParams.get("code")!, state: loc.searchParams.get("state")! };
}

async function team(prefix: string) {
  const owner = await makeUser(`${prefix}-owner`);
  const ws = await createWorkspace(owner, unique(prefix));
  const ownerSession = await sessionFor(owner);
  return { owner, ws, ownerSession };
}

async function connect(user: { id: string }, session: TestSession, workspaceId: string) {
  const { url } = await startOAuth(db, { userId: user.id, sessionToken: session.token, workspaceId, providerId: "google_sheets" });
  const a = await authorize(url);
  return completeOAuth(db, { state: a.state, code: a.code, userId: user.id, sessionToken: session.token });
}

async function conn(id: string) {
  const [c] = await db.select().from(schema.connection).where(eq(schema.connection.id, id));
  return c!;
}
const creds = (c: { id: string; workspaceId: string; provider: string }) => getRuntimeCredentials(db, { connectionId: c.id, workspaceId: c.workspaceId, providerId: c.provider, requiredScopes: [] });

async function platformRow() {
  const [row] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, PURPOSE));
  return row;
}

/** A brand-new platform app row (epoch 1) — the precondition of the retest scenario. */
async function freshPlatformApp() {
  await unseedPlatformCredential(PURPOSE);
  await seedPlatformCredential(PURPOSE, { publicId: "fake-client", secret: "fake-secret" });
  const row = await platformRow();
  expect(row!.epoch).toBe(1);
  return row!;
}

/** The administrator's revoke → clear → configure again with the SAME client id (new row, epoch back to 1). */
async function revokeClearRecreate() {
  const st = await platformCredentialStatus(PURPOSE);
  await revokePlatformSecret(SYSTEM, PURPOSE, st!.revision);
  const revoked = await platformCredentialStatus(PURPOSE);
  await clearPlatformSecret(SYSTEM, PURPOSE, revoked!.revision);
  expect(await platformRow()).toBeUndefined();
  await setPlatformSecret(SYSTEM, PURPOSE, { publicId: "fake-client", secret: "fake-secret", expectedRevision: 0 });
  const row = await platformRow();
  expect(row).toMatchObject({ publicId: "fake-client", epoch: 1 });
  return row!;
}

/* ───────────── platform app: clear → recreate ───────────── */

describe("CXH-01: platform OAuth app identity survives revoke → clear → recreate with the same client id", () => {
  it("(1) an in-flight callback (state consumed, code exchanged, paused before finalisation) never yields a usable connection", async () => {
    const original = await freshPlatformApp();
    const { owner, ws, ownerSession } = await team("cxh01id");
    const { url } = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
    const a = await authorize(url);
    // The identity lookup (right after the code exchange) is held briefly, so the test can take its lock in between.
    await fake.fault({ provider: "google_sheets", pathPattern: "userinfo", mode: "delay", delayMs: 1500, times: 1 });
    const before = (await fake.requests("google_sheets")).length;
    let hold: Awaited<ReturnType<typeof holdLock>> | null = null;
    const waitersBefore = await lockWaiters();
    try {
      const callback = settle(completeOAuth(db, { state: a.state, code: a.code, userId: owner.id, sessionToken: ownerSession.token }));
      await until(async () => (await fake.requests("google_sheets")).slice(before).some((r) => r.path.includes("userinfo")), "the callback to exchange the code and start its identity lookup");
      const recorded = (await fake.requests("google_sheets")).slice(before);
      expect(recorded.some((r) => r.method === "POST" && r.path === "/oauth/token")).toBe(true); // tokens exchanged
      const [state] = await db.select().from(schema.oauthState).where(eq(schema.oauthState.userId, owner.id));
      expect(state?.usedAt).toBeTruthy(); // state consumed
      // Pause the callback before its final re-checks and store: every membership read now waits for this lock.
      hold = await holdLock("lock table workspace_member in access exclusive mode");
      await until(async () => (await lockWaiters()) > waitersBefore, "the callback to block before finalisation");
      expect(callback.done).toBe(false);
      const replacement = await revokeClearRecreate();
      expect(replacement.id).not.toBe(original.id);
      expect(callback.done).toBe(false); // the whole revoke → clear → recreate happened while the callback was paused
      await hold.release();
      hold = null;
      await callback.promise;
      const rows = await db.select().from(schema.connection).where(eq(schema.connection.workspaceId, ws.id));
      for (const c of rows) {
        expect(c.status).not.toBe("active");
        await expect(creds(c)).rejects.toBeInstanceOf(ConnectionError);
      }
      if (rows.length === 0) expect((callback.error as { code?: string } | undefined)?.code).toBe("OAUTH_APP_CHANGED");
    } finally {
      if (hold) await hold.release();
      await seedPlatformCredential(PURPOSE, { publicId: "fake-client", secret: "fake-secret" });
    }
  });

  it("(2) a connection authorized under the old platform row is refused at runtime (and at refresh) after clear → recreate", async () => {
    const original = await freshPlatformApp();
    const { owner, ws, ownerSession } = await team("cxh01rt2");
    try {
      const r = await connect(owner, ownerSession, ws.id);
      expect(await conn(r.connectionId)).toMatchObject({ oauthAppSource: "platform", oauthClientId: "fake-client", oauthAppEpoch: 1, oauthPlatformSecretId: original.id });
      await creds(await conn(r.connectionId)); // usable while its app is live
      const replacement = await revokeClearRecreate();
      expect(replacement.id).not.toBe(original.id);
      // Simulate a connection the expiry sweep missed: status active again, token not expired.
      await db.update(schema.connection).set({ status: "active", statusReason: null }).where(eq(schema.connection.id, r.connectionId));
      await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
      expect((await conn(r.connectionId)).status).toBe("expired");
      // ...and with an expiring token (the refresh path) it is never refreshed with the replacement app.
      await db.update(schema.connection).set({ status: "active", statusReason: null, accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.connection.id, r.connectionId));
      const tokenPostsBefore = (await fake.requests("google_sheets")).filter((q) => q.path === "/oauth/token").length;
      await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
      expect((await fake.requests("google_sheets")).filter((q) => q.path === "/oauth/token").length).toBe(tokenPostsBefore);
      // A connection authorized under the replacement row works and records it.
      const fresh = await connect(owner, ownerSession, ws.id);
      expect(await conn(fresh.connectionId)).toMatchObject({ status: "active", oauthPlatformSecretId: replacement.id });
      expect((await creds(await conn(fresh.connectionId))).creds.token).toBeTruthy();
    } finally {
      await seedPlatformCredential(PURPOSE, { publicId: "fake-client", secret: "fake-secret" });
    }
  });

  it("(3) happy path + same-row secret rotation: connections keep working and refresh (same row, new revision)", async () => {
    const original = await freshPlatformApp();
    const { owner, ws, ownerSession } = await team("cxh01rot");
    try {
      const r = await connect(owner, ownerSession, ws.id);
      expect(await conn(r.connectionId)).toMatchObject({ status: "active", oauthPlatformSecretId: original.id, oauthAppEpoch: 1 });
      expect((await creds(await conn(r.connectionId))).creds.token).toBeTruthy();
      await setPlatformSecret(SYSTEM, PURPOSE, { secret: "fake-secret-rotated", expectedRevision: original.revision });
      const rotated = await platformRow();
      expect(rotated).toMatchObject({ id: original.id, revision: original.revision + 1, epoch: original.epoch });
      // Unexpired token: still usable.
      expect((await creds(await conn(r.connectionId))).creds.token).toBeTruthy();
      // Expiring token: refreshed with the rotated secret of the SAME app row.
      await db.update(schema.connection).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.connection.id, r.connectionId));
      const before = (await fake.requests("google_sheets")).length;
      const out = await creds(await conn(r.connectionId));
      expect(out.creds.token).toBeTruthy();
      expect((await fake.requests("google_sheets")).slice(before).some((q) => q.method === "POST" && q.path === "/oauth/token")).toBe(true);
      expect(await conn(r.connectionId)).toMatchObject({ status: "active", oauthPlatformSecretId: original.id });
      // A new authorization after the rotation binds to the same row too.
      const again = await connect(owner, ownerSession, ws.id);
      expect(await conn(again.connectionId)).toMatchObject({ status: "active", oauthPlatformSecretId: original.id });
    } finally {
      await seedPlatformCredential(PURPOSE, { publicId: "fake-client", secret: "fake-secret" });
    }
  });
});

/* ───────────── workspace app: delete → recreate (symmetry check) ───────────── */

describe("CXH-01: workspace OAuth app delete → recreate with the same client id", () => {
  it("a connection of the deleted app stays refused; a callback started under it can't store under the new app", async () => {
    await freshPlatformApp();
    const { owner, ws, ownerSession } = await team("cxh01ws");
    await fake.oauthClient("google_sheets", "ws-same-client", ["ws-same-secret-value"]);
    try {
      await upsertWorkspaceApp(owner, ws.id, "google", { clientId: "ws-same-client", secret: "ws-same-secret-value", expectedRevision: 0 });
      const old = await connect(owner, ownerSession, ws.id);
      const oldConn = await conn(old.connectionId);
      expect(oldConn.oauthAppSource).toBe("workspace");
      // An authorization started under the old app, completed after the delete → recreate.
      const { url } = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
      const pending = await authorize(url);
      await deleteWorkspaceApp(owner, ws.id, "google", 1);
      await upsertWorkspaceApp(owner, ws.id, "google", { clientId: "ws-same-client", secret: "ws-same-secret-value", expectedRevision: 0 });
      const [now] = await db.select().from(schema.workspaceOauthApp).where(eq(schema.workspaceOauthApp.workspaceId, ws.id));
      expect(now).toBeTruthy();
      await expect(completeOAuth(db, { state: pending.state, code: pending.code, userId: owner.id, sessionToken: ownerSession.token })).rejects.toMatchObject({ status: expect.any(Number) });
      await db.update(schema.connection).set({ status: "active", statusReason: null }).where(eq(schema.connection.id, old.connectionId));
      await expect(creds(await conn(old.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
      const fresh = await connect(owner, ownerSession, ws.id);
      const freshConn = await conn(fresh.connectionId);
      expect(freshConn.oauthAppId).not.toBe(oldConn.oauthAppId);
      expect((await creds(freshConn)).creds.token).toBeTruthy();
    } finally {
      await fake.oauthClient("google_sheets", "ws-same-client", []);
      await seedPlatformCredential(PURPOSE, { publicId: "fake-client", secret: "fake-secret" });
    }
  });
});
