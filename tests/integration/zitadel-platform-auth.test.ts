import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { GET as authConfigGET } from "@/app/api/auth-config/route";
import { db, schema } from "@/db";
import { currentSnapshot, instanceForCallback } from "@/server/auth-dispatch";
import { sha256Hex } from "@/server/crypto";
import { revokePlatformSecret, platformCredentialStatus } from "@/server/platform-secrets";
import { seedPlatformCredential, unseedPlatformCredential } from "../fixtures/platform-seed";
import { closeDb } from "./helpers";
import * as zitadelConfig from "@/server/zitadel-config";

const SYSTEM = { userId: null, label: "zitadel-test", assurance: "system" as const };
const issuer = "https://test-instance.zitadel.cloud";
const state = "zitadel-pinned-attempt-test";
const oldAuthBase = process.env.BETTER_AUTH_URL;

afterAll(async () => {
  await unseedPlatformCredential("signin.zitadel");
  await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, "signin.zitadel.issuer"));
  await db.delete(schema.signinAttempt).where(eq(schema.signinAttempt.stateHash, sha256Hex(state)));
  if (oldAuthBase === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = oldAuthBase;
  await closeDb();
});

describe("platform ZITADEL sign-in availability", () => {
  it("needs both owner issuer and encrypted credential; callback pins immutable app id and revocation closes it", async () => {
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await unseedPlatformCredential("signin.zitadel");
    await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, "signin.zitadel.issuer"));
    const available = async () => (await (await authConfigGET(new Request("http://localhost:3000/api/auth-config"))).json()) as { zitadel: boolean };
    expect((await available()).zitadel).toBe(false);
    // The test fixture inserts already validated public metadata, while the production route validates discovery.
    await db.insert(schema.platformSetting).values({ key: "signin.zitadel.issuer", value: issuer, revision: 1, setBy: "zitadel-test" });
    expect((await available()).zitadel).toBe(false);
    await seedPlatformCredential("signin.zitadel", { publicId: "12345@tenant", secret: "test-zitadel-secret" });
    expect((await available()).zitadel).toBe(true);
    const snap = await currentSnapshot();
    expect(snap.zitadel?.issuer).toBe(issuer);
    expect(snap.social.zitadel).toBeUndefined();
    const app = (await platformCredentialStatus("signin.zitadel"))!;
    await db.insert(schema.signinAttempt).values({ stateHash: sha256Hex(state), provider: "zitadel", revision: app.revision, secretId: app.id, expiresAt: new Date(Date.now() + 60_000) });
    await db.insert(schema.verification).values({ id: crypto.randomUUID(), identifier: `signin-issuer:${sha256Hex(state)}`, value: JSON.stringify([issuer, 1, "12345@tenant"]), expiresAt: new Date(Date.now() + 60_000) });
    expect((await instanceForCallback("zitadel", state))?.revision).toBe(app.revision);
    const originalConfig = (await zitadelConfig.activeZitadelConfig())!;
    for (const mutation of [{ issuer: "https://replacement.zitadel.cloud" }, { issuerRevision: 2 }, { clientId: "replacement-client" }]) {
      const lookup = vi.spyOn(zitadelConfig, "activeZitadelConfig")
        .mockResolvedValueOnce(originalConfig)
        .mockResolvedValueOnce({ ...originalConfig, ...mutation });
      try { expect(await instanceForCallback("zitadel", state)).toBeNull(); }
      finally { lookup.mockRestore(); }
    }
    await db.update(schema.platformSetting).set({ value: "https://replacement.zitadel.cloud", revision: 2 }).where(eq(schema.platformSetting.key, "signin.zitadel.issuer"));
    expect(await instanceForCallback("zitadel", state)).toBeNull();
    await db.update(schema.platformSetting).set({ value: issuer, revision: 2 }).where(eq(schema.platformSetting.key, "signin.zitadel.issuer"));
    expect(await instanceForCallback("zitadel", state)).toBeNull(); // even replacing and restoring the issuer invalidates the attempt
    await revokePlatformSecret(SYSTEM, "signin.zitadel", app.revision);
    expect((await available()).zitadel).toBe(false);
    expect(await instanceForCallback("zitadel", state)).toBeNull();
  });
});
