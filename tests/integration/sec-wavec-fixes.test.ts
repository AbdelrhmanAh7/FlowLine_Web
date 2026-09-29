/**
 * Regression tests for the Wave C credential findings (artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md):
 * CXH-01 (OAuth callback vs revocation), CXH-02 (sign-in instance cache identity), CXH-05 (step data size),
 * CXH-06 (KEK rotation of social tokens), CXH-10 (workspace OAuth app concurrency), CXH-14 (transient refresh failures).
 *
 * Races use REAL PostgreSQL row locks for a controlled interleaving: a test transaction holds a lock the product code
 * needs, the test waits until the competing operations are provably blocked (pg_stat_activity), then releases it.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, schema } from "@/db";
import { dispatchAuth, instanceForCallback } from "@/server/auth-dispatch";
import { completeOAuth, ConnectionError, getRuntimeCredentials, startOAuth, STATUS_REASONS } from "@/server/connections";
import { decryptSecretV2, openSecret, sha256Hex } from "@/server/crypto";
import { deleteWorkspaceApp, upsertWorkspaceApp } from "@/server/oauth-apps";
import { clearPlatformSecret, platformCredentialStatus, revokePlatformSecret } from "@/server/platform-secrets";
import { createFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { seedPlatformCredential, unseedPlatformCredential } from "../fixtures/platform-seed";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";
import { ORIGIN, sessionFor, type TestSession } from "./platform-helpers";

const SYSTEM = { userId: null, label: "test", assurance: "system" as const };

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
  await fake.reset();
  await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
  await fake.oauthClient("google_sheets", "fake-client", ["fake-secret"]);
});
afterAll(async () => {
  await seedPlatformCredential("integration.google", { publicId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "fake-client", secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "fake-secret" });
  await unseedPlatformCredential("signin.google");
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
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/** A separate connection holding row locks until `release()` (the controlled interleaving point). */
async function holdLock(sqlText: string, params: unknown[]) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query(sqlText, params);
  return {
    client,
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

async function flowUsing(workspaceId: string, connectionId: string) {
  const [f] = await db
    .insert(schema.flow)
    .values({ workspaceId, name: unique("uses"), graph: { nodes: [{ id: "a", type: "action", position: { x: 0, y: 0 }, data: { config: { connectionId } } }], edges: [] } as never })
    .returning();
  return f!.id;
}

/* ───────────── CXH-01 ───────────── */

describe("CXH-01: an OAuth callback racing a platform-app revocation never leaves a usable connection", () => {
  it("callback blocked right before storing while the app is revoked → no active / usable connection (either order)", async () => {
    const { owner, ws, ownerSession } = await team("cxh01");
    const { url } = await startOAuth(db, { userId: owner.id, sessionToken: ownerSession.token, workspaceId: ws.id, providerId: "google_sheets" });
    const a = await authorize(url);
    // Hold the workspace row: the callback can do its exchange and every app check, but the connection INSERT (FK →
    // workspace) waits here — the exact window between "final app check" and "store".
    const hold = await holdLock("select id from workspace where id = $1 for update", [ws.id]);
    let released = false;
    try {
      const callback = settle(completeOAuth(db, { state: a.state, code: a.code, userId: owner.id, sessionToken: ownerSession.token }));
      await until(async () => (await lockWaiters()) >= 1, "the callback to block on the workspace row");
      const st = await platformCredentialStatus("integration.google");
      const revoke = settle(revokePlatformSecret(SYSTEM, "integration.google", st!.revision));
      // Either the revocation completes while the callback waits (unfenced), or it is serialized behind the callback.
      await until(async () => revoke.done || (await lockWaiters()) >= 2, "the revocation to finish or to wait for the callback");
      await hold.release();
      released = true;
      await Promise.all([callback.promise, revoke.promise]);
      expect(revoke.error).toBeUndefined();
      const rows = await db.select().from(schema.connection).where(eq(schema.connection.workspaceId, ws.id));
      for (const c of rows) {
        expect(c.status).not.toBe("active");
        await expect(creds(c)).rejects.toBeInstanceOf(ConnectionError);
      }
    } finally {
      if (!released) await hold.release();
      await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
    }
  });

  it("runtime access checks the PLATFORM issuing app: revoked, cleared or re-set after revocation → refused, even with an unexpired token", async () => {
    const { owner, ws, ownerSession } = await team("cxh01rt");
    try {
      const r = await connect(owner, ownerSession, ws.id);
      await creds(await conn(r.connectionId)); // usable while the app is live
      const st = await platformCredentialStatus("integration.google");
      await revokePlatformSecret(SYSTEM, "integration.google", st!.revision);
      // Simulate a connection the expiry sweep missed (e.g. stored by a racing callback, or a crash before the sweep).
      await db.update(schema.connection).set({ status: "active", statusReason: null }).where(eq(schema.connection.id, r.connectionId));
      await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
      expect(await conn(r.connectionId)).toMatchObject({ status: "expired", statusReason: STATUS_REASONS.oauth_app_revoked });
      // The same client id configured again after the revoke is a NEW app epoch: tokens issued before still don't count.
      await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
      await db.update(schema.connection).set({ status: "active", statusReason: null }).where(eq(schema.connection.id, r.connectionId));
      await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
      // A connection authorized under the current epoch works.
      const fresh = await connect(owner, ownerSession, ws.id);
      expect((await creds(await conn(fresh.connectionId))).creds.token).toBeTruthy();
    } finally {
      await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
    }
  });
});

/* ───────────── CXH-02 ───────────── */

async function startSocial() {
  const res = await dispatchAuth(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ provider: "google", callbackURL: "/app" }) }), "POST");
  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url ? new URL(body.url) : null;
  return { status: res.status, clientId: url?.searchParams.get("client_id") ?? null, state: url?.searchParams.get("state") ?? null };
}

function socialOf(instance: unknown) {
  return (instance as { options: { socialProviders: Record<string, { clientId: string; clientSecret: string }> } }).options.socialProviders.google!;
}

describe("CXH-02: clear → reconfigure never reuses the old sign-in app's client id / secret", () => {
  it("a new app that restarts at revision 1 gets its own better-auth instance and attempt binding", async () => {
    await unseedPlatformCredential("signin.google");
    await seedPlatformCredential("signin.google", { publicId: "g-old-client", secret: "g-old-secret-value" });
    const first = await startSocial();
    expect(first.clientId).toBe("g-old-client");
    const oldCb = await instanceForCallback("google", first.state);
    expect(socialOf(oldCb!.instance)).toMatchObject({ clientId: "g-old-client", clientSecret: "g-old-secret-value" });
    const [oldRow] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, "signin.google"));

    // Revoke, clear (row removed) and configure a DIFFERENT app: its row starts again at revision 1.
    await revokePlatformSecret(SYSTEM, "signin.google", oldRow!.revision);
    await clearPlatformSecret(SYSTEM, "signin.google", oldRow!.revision);
    await seedPlatformCredential("signin.google", { publicId: "g-new-client", secret: "g-new-secret-value" });
    const [newRow] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, "signin.google"));
    expect(newRow!.revision).toBe(oldRow!.revision); // same revision number — only the identity differs

    const second = await startSocial();
    expect(second.clientId).toBe("g-new-client");
    const newCb = await instanceForCallback("google", second.state);
    expect(newCb).not.toBeNull();
    expect(socialOf(newCb!.instance)).toMatchObject({ clientId: "g-new-client", clientSecret: "g-new-secret-value" });

    // A pending attempt recorded for the OLD app (same provider + revision number) is refused: bound to the app identity.
    const oldState = `old-${randomUUID()}`;
    await db.insert(schema.signinAttempt).values({ stateHash: sha256Hex(oldState), provider: "google", revision: oldRow!.revision, secretId: oldRow!.id, expiresAt: new Date(Date.now() + 60_000) } as typeof schema.signinAttempt.$inferInsert);
    expect(await instanceForCallback("google", oldState)).toBeNull();
    const [attempt] = await db.select().from(schema.signinAttempt).where(eq(schema.signinAttempt.stateHash, sha256Hex(second.state!)));
    expect(attempt).toMatchObject({ revision: newRow!.revision, secretId: newRow!.id });
  });
});

/* ───────────── CXH-05 ───────────── */

describe("CXH-05: step data is not limited by the credential size cap", () => {
  it("a run whose input carries ~60,000 multi-byte characters persists and re-reads its encrypted step data", async () => {
    const user = await makeUser("cxh05");
    const ws = await createWorkspace(user, unique("Big data"));
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Big") });
    const notes = "中".repeat(60_000); // 180,000 UTF-8 bytes, within the 256 KB run-input limit
    const run = await enqueueRun(user, flow.id, { input: { lead: { name: "Ada Lovelace", email: "ada@analytical.io", employees: 120, notes } } });
    await claimAndProcess(run.id);
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    const [trigger] = await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, run.id), eq(schema.runStep.nodeId, "trigger")));
    expect(trigger!.dataEnc).not.toBeNull();
    const data = openSecret<{ output: { lead: { notes: string } } }>({ ciphertext: trigger!.dataEnc!.ciphertext, keyId: trigger!.dataEnc!.keyId, legacy: false }, { table: "run_step", rowId: `${run.id}.${sha256Hex("trigger").slice(0, 32)}`, workspaceId: ws.id, provider: "engine", purpose: "step_data" });
    expect(data.output.lead.notes).toBe(notes);
  });
});

/* ───────────── CXH-10 ───────────── */

describe("CXH-10: concurrent workspace OAuth app changes read the authoritative row under the lock", () => {
  async function appRow(workspaceId: string) {
    const [row] = await db.select().from(schema.workspaceOauthApp).where(and(eq(schema.workspaceOauthApp.workspaceId, workspaceId), eq(schema.workspaceOauthApp.family, "google")));
    return row!;
  }

  it("two rotations that both loaded revision 1: exactly one wins, the other gets REVISION_CONFLICT (no lost secret)", async () => {
    const owner = await makeUser("cxh10");
    const ws = await createWorkspace(owner, unique("Rotate race"));
    await upsertWorkspaceApp(owner, ws.id, "google", { clientId: "cxh10-client", secret: "secret-original", expectedRevision: 0 });
    const app = await appRow(ws.id);
    const hold = await holdLock("select id from workspace_oauth_app where id = $1 for update", [app.id]);
    let released = false;
    try {
      const a = settle(upsertWorkspaceApp(owner, ws.id, "google", { clientId: "cxh10-client", secret: "secret-from-a", expectedRevision: 1 }));
      const b = settle(upsertWorkspaceApp(owner, ws.id, "google", { clientId: "cxh10-client", secret: "secret-from-b", expectedRevision: 1 }));
      await until(async () => (await lockWaiters()) >= 2, "both rotations to wait for the app row lock");
      await hold.release();
      released = true;
      await Promise.all([a.promise, b.promise]);
      const outcomes = [a, b];
      expect(outcomes.filter((o) => o.error === undefined)).toHaveLength(1);
      const loser = outcomes.find((o) => o.error !== undefined)!;
      expect(loser.error).toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
      const row = await appRow(ws.id);
      expect(row.revision).toBe(2);
      expect(row.prevRevision).toBe(1);
      const winner = a.error === undefined ? "secret-from-a" : "secret-from-b";
      const ctx = (revision: number) => ({ table: "workspace_oauth_app", rowId: row.id, workspaceId: ws.id, provider: "google", purpose: "oauth_client_secret", revision });
      expect(decryptSecretV2<string>(row.secretEnc!, row.keyId!, ctx(2))).toBe(winner);
      expect(decryptSecretV2<string>(row.prevSecretEnc!, row.prevKeyId!, ctx(1))).toBe("secret-original");
    } finally {
      if (!released) await hold.release();
    }
  });

  it("a rotation and a deletion that both loaded revision 1: exactly one applies", async () => {
    const owner = await makeUser("cxh10d");
    const ws = await createWorkspace(owner, unique("Delete race"));
    await upsertWorkspaceApp(owner, ws.id, "google", { clientId: "cxh10d-client", secret: "secret-original", expectedRevision: 0 });
    const app = await appRow(ws.id);
    const hold = await holdLock("select id from workspace_oauth_app where id = $1 for update", [app.id]);
    let released = false;
    try {
      const rotate = settle(upsertWorkspaceApp(owner, ws.id, "google", { clientId: "cxh10d-client", secret: "secret-rotated", expectedRevision: 1 }));
      const del = settle(deleteWorkspaceApp(owner, ws.id, "google", 1));
      await until(async () => (await lockWaiters()) >= 2, "the rotation and the deletion to wait for the app row lock");
      await hold.release();
      released = true;
      await Promise.all([rotate.promise, del.promise]);
      const ok = [rotate, del].filter((o) => o.error === undefined);
      expect(ok).toHaveLength(1);
      const failed = [rotate, del].find((o) => o.error !== undefined)!;
      expect(failed.error).toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
      const row = await appRow(ws.id);
      if (rotate.error === undefined) expect(row).toMatchObject({ revision: 2, deletedAt: null });
      else expect(row.deletedAt).not.toBeNull();
    } finally {
      if (!released) await hold.release();
    }
  });
});

/* ───────────── CXH-14 ───────────── */

describe("CXH-14: transient refresh failures keep the credentials", () => {
  it("429 (with Retry-After) and 5xx fail the step retryably; the connection stays active and nothing pauses; invalid_grant still expires", async () => {
    const { owner, ws, ownerSession } = await team("cxh14");
    const r = await connect(owner, ownerSession, ws.id);
    const flowId = await flowUsing(ws.id, r.connectionId);
    const expire = () => db.update(schema.connection).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.connection.id, r.connectionId));
    const before = await conn(r.connectionId);

    await expire();
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "429", retryAfterSec: 7 });
    const e429 = await creds(await conn(r.connectionId)).catch((e) => e);
    expect(e429).toBeInstanceOf(ConnectionError);
    expect(e429).toMatchObject({ code: "CONNECTION_UNAVAILABLE", retryable: true, retryAfterMs: 7000 });
    let c = await conn(r.connectionId);
    expect(c).toMatchObject({ status: "active", statusReason: null, credVersion: before.credVersion, secretEnc: before.secretEnc });
    const [f] = await db.select({ p: schema.flow.pausedReason }).from(schema.flow).where(eq(schema.flow.id, flowId));
    expect(f!.p).toBeNull();

    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "500" });
    await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_UNAVAILABLE", retryable: true });
    expect((await conn(r.connectionId)).status).toBe("active");

    // The provider recovers: the same (untouched) refresh token still works.
    const ok = await creds(await conn(r.connectionId));
    expect(ok.creds.token).toBeTruthy();

    // A recognized permanent grant failure still expires the connection.
    await expire();
    await fake.oauthError("google_sheets", "invalid_grant", "Token has been expired or revoked.");
    await expect(creds(await conn(r.connectionId))).rejects.toMatchObject({ code: "CONNECTION_EXPIRED" });
    c = await conn(r.connectionId);
    expect(c).toMatchObject({ status: "expired", statusReason: STATUS_REASONS.refresh_refused });
  });

  it("an unrecognized 4xx provider error keeps the connection (only permanent grant failures expire it)", async () => {
    const { owner, ws, ownerSession } = await team("cxh14u");
    const r = await connect(owner, ownerSession, ws.id);
    await db.update(schema.connection).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.connection.id, r.connectionId));
    await fake.oauthError("google_sheets", "rate_limited", "slow down");
    const e = await creds(await conn(r.connectionId)).catch((x) => x);
    expect(e).toBeInstanceOf(ConnectionError);
    expect((e as ConnectionError).code).not.toBe("CONNECTION_EXPIRED");
    expect((await conn(r.connectionId)).status).toBe("active");
  });
});

/* CXH-06 (KEK rotation) moved to sec-cxh06-rotation.test.ts: it rewraps every envelope, so it runs in its own throwaway DB. */
