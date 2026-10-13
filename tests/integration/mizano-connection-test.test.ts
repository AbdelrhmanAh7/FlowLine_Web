// Test connection for a SAVED connection (#145): access rules, stored-secret handling and the bounded failure codes,
// against a real DB and the fake Mizano (POST /api/workspaces/{wid}/connections/{cid}/test calls testConnection).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { encryptSecretV2 } from "@/server/crypto";
import { testConnection } from "@/server/connection-test";
import { createConnection, listConnections } from "@/server/connections";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { addMember, closeDb, expectHttpError, makeUser, unique } from "./helpers";

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
  await closeDb();
});

const KEY = "test-token";

async function setup(visibility: "workspace" | "private" = "workspace") {
  const owner = await makeUser("mz-owner");
  const ws = await createWorkspace(owner, unique("mz"));
  const conn = await createConnection(db, owner.id, ws.id, "mizano", "Mizano test", { token: KEY, baseUrl: "https://mizano.example.com" }, { visibility });
  return { owner, ws, conn };
}

/** Replaces the stored secret as a later key rotation would (bypassing the connect-time check, which rejects a bad key). */
async function storeKey(wsId: string, connId: string, token: string) {
  const enc = encryptSecretV2({ type: "api_key", token, settings: { baseUrl: "https://mizano.example.com" } }, { table: "connection", rowId: connId, workspaceId: wsId, provider: "mizano", purpose: "credentials" });
  await db.update(schema.connection).set({ secretEnc: enc.ciphertext, keyId: enc.keyId, legacyCrypto: false }).where(eq(schema.connection.id, connId));
}

describe("testConnection (saved Mizano connection)", () => {
  it("reports OK for the owner and an editor, and returns only the account label, never the key", async () => {
    const { owner, ws, conn } = await setup();
    const editor = await makeUser("mz-editor");
    await addMember(ws.id, editor.id, "editor");
    for (const user of [owner, editor]) {
      const out = await testConnection(user, ws.id, conn.id);
      expect(out).toEqual({ ok: true, provider: "Mizano", accountLabel: "Alice A Mizano" });
      expect(JSON.stringify(out)).not.toContain(KEY);
    }
  });

  it("a viewer gets 403 and a non-member 404; neither reaches the provider", async () => {
    const { ws, conn } = await setup();
    const viewer = await makeUser("mz-viewer");
    await addMember(ws.id, viewer.id, "viewer");
    const stranger = await makeUser("mz-stranger");
    await fake.reset();
    await expectHttpError(testConnection(viewer, ws.id, conn.id), 403);
    await expectHttpError(testConnection(stranger, ws.id, conn.id), 404);
    expect(await fake.requests("mizano")).toEqual([]);
  });

  it("an unknown or malformed connection id, or one from another workspace, is a 404", async () => {
    const { owner, ws, conn } = await setup();
    const other = await setup();
    await expectHttpError(testConnection(owner, ws.id, randomUUID()), 404, "CONNECTION_NOT_FOUND");
    await expectHttpError(testConnection(owner, ws.id, "not-a-uuid"), 404);
    await expectHttpError(testConnection(owner, ws.id, other.conn.id), 404, "CONNECTION_NOT_FOUND");
    expect(conn.id).not.toBe(other.conn.id);
  });

  it("a private connection can only be tested by its creator, even by another editor", async () => {
    const { owner, ws, conn } = await setup("private");
    const editor = await makeUser("mz-editor");
    await addMember(ws.id, editor.id, "editor");
    await expectHttpError(testConnection(editor, ws.id, conn.id), 403, "NOT_CONNECTION_OWNER");
    await expect(testConnection(owner, ws.id, conn.id)).resolves.toMatchObject({ ok: true });
  });

  it("a stored key the provider now rejects is 400 AUTHENTICATION_FAILED with fixed text", async () => {
    const { owner, ws, conn } = await setup();
    await storeKey(ws.id, conn.id, "revoked-key");
    const err = await expectHttpError(testConnection(owner, ws.id, conn.id), 400, "AUTHENTICATION_FAILED");
    expect(err.message).toBe("Invalid API key");
    expect(err.message).not.toContain("revoked-key");
  });

  it("an instance that does not answer in time is 502 PROVIDER_UNREACHABLE", async () => {
    const { owner, ws, conn } = await setup();
    await fake.fault({ provider: "mizano", pathPattern: "/api/health", mode: "timeout", times: 1 });
    await expectHttpError(testConnection(owner, ws.id, conn.id, 150), 502, "PROVIDER_UNREACHABLE");
  });

  it("the saved key is encrypted at rest and never part of what the connection list returns", async () => {
    const { ws, conn } = await setup();
    const [row] = await db.select().from(schema.connection).where(eq(schema.connection.id, conn.id));
    expect(row!.secretEnc).not.toContain(KEY);
    expect(JSON.stringify(row!.settings)).not.toContain(KEY);
    const listed = await listConnections(db, ws.id);
    expect(JSON.stringify(listed)).not.toContain(KEY);
    expect(JSON.stringify(conn)).not.toContain(KEY);
  });
});
