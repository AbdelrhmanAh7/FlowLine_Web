/**
 * Crypto v2 migration tooling (scripts/admin/rewrap.mts): legacy v1 rows are upgraded with their trusted row context
 * and then refuse v1; plaintext social tokens are encrypted; legacy OAuth connections are bound to an app ONLY by an
 * explicit operator backfill. (KEK rotation is covered in tests/unit/crypto-v2.test.ts — rotating the shared test DB's
 * key here would break the other suites.)
 */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { createConnection, getRuntimeCredentials } from "@/server/connections";
import { encryptSecret, openSecret } from "@/server/crypto";
import { backfillLegacyOAuthApp, rewrapAll } from "@/server/rewrap";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { closeDb, makeUser, unique } from "./helpers";

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
  await closeDb();
});

describe("rewrap / migration", () => {
  it("upgrades legacy rows to bound v2 envelopes, clears the legacy flag, encrypts plaintext social tokens, and is audited", async () => {
    const owner = await makeUser("rewrap");
    const ws = await createWorkspace(owner, unique("Rewrap"));
    const c = await createConnection(db, owner.id, ws.id, "slack", "legacy slack", { token: "test-token" });
    const v1 = encryptSecret({ type: "oauth2", token: "test-token", settings: {} });
    await db.update(schema.connection).set({ secretEnc: v1.ciphertext, keyId: v1.keyId, legacyCrypto: true }).where(eq(schema.connection.id, c.id));
    const acct = { id: randomUUID(), accountId: `g-${randomUUID()}`, providerId: "google", userId: owner.id, accessToken: "ya29.plaintext-legacy", refreshToken: "1//plaintext-legacy" };
    await db.insert(schema.account).values(acct);

    const dry = await rewrapAll({ dryRun: true });
    expect(dry.find((r) => r.table === "connection")!.legacyUpgraded).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(schema.connection).where(eq(schema.connection.id, c.id)))[0]!.legacyCrypto).toBe(true); // dry run wrote nothing

    const done = await rewrapAll();
    expect(done.find((r) => r.table === "connection")!.legacyUpgraded).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(schema.connection).where(eq(schema.connection.id, c.id));
    expect(row!.legacyCrypto).toBe(false);
    expect(row!.secretEnc.startsWith("v2.a256gcm-kw.")).toBe(true);
    const got = await getRuntimeCredentials(db, { connectionId: c.id, workspaceId: ws.id, providerId: "slack", requiredScopes: [] });
    expect(got.creds.token).toBe("test-token");
    // The domain now refuses v1 for this row.
    expect(() => openSecret({ ciphertext: v1.ciphertext, keyId: v1.keyId, legacy: row!.legacyCrypto }, { table: "connection", rowId: c.id, workspaceId: ws.id, provider: "slack", purpose: "credentials" })).toThrow();
    const [a] = await db.select().from(schema.account).where(eq(schema.account.id, acct.id));
    expect(a!.accessToken).toMatch(/^v2\.a256gcm-kw\./);
    expect(a!.refreshToken).not.toContain("plaintext-legacy");
    const [ev] = await db.select().from(schema.platformAuditEvent).where(eq(schema.platformAuditEvent.action, "crypto.rewrap")).orderBy(desc(schema.platformAuditEvent.id)).limit(1);
    expect(ev).toMatchObject({ assurance: "cli", actorLabel: "cli:rewrap" });
    // A second run has nothing left to do for these rows.
    const again = await rewrapAll({ dryRun: true });
    expect(again.find((r) => r.table === "connection")!.legacyUpgraded).toBe(0);
  });

  it("binds legacy OAuth connections to an app only when the operator attests the issuing client id", async () => {
    const owner = await makeUser("backfill");
    const ws = await createWorkspace(owner, unique("Backfill"));
    const v1 = encryptSecret({ type: "oauth2", token: "t", refreshToken: "r", settings: {} });
    const [legacy] = await db
      .insert(schema.connection)
      .values({ workspaceId: ws.id, provider: "gmail", label: "legacy gmail", authType: "oauth2", accountId: "a", accountLabel: "a", scopes: [], secretEnc: v1.ciphertext, keyId: v1.keyId, legacyCrypto: true, createdBy: owner.id })
      .returning();
    expect(await backfillLegacyOAuthApp("google", "attested-client", { dryRun: true })).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(schema.connection).where(eq(schema.connection.id, legacy!.id)))[0]!.oauthAppSource).toBeNull();
    await backfillLegacyOAuthApp("google", "attested-client");
    expect((await db.select().from(schema.connection).where(eq(schema.connection.id, legacy!.id)))[0]).toMatchObject({ oauthAppSource: "platform", oauthClientId: "attested-client" });
  });
});
