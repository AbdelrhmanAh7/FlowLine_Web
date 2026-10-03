import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { zitadelProvider } from "@/server/zitadel-auth";
import * as egress from "@/server/egress";
import { closeDb } from "./helpers";
import { makeVerifiedUser } from "./platform-helpers";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(closeDb);

describe("M7: issuer replacement cannot inherit a persistent account", () => {
  it("uses the real better-auth account adapter to isolate equal subjects from different issuers and legacy subjects", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://flowline.example");
    const user = await makeVerifiedUser("issuer-owner");
    const sub = randomUUID();
    vi.spyOn(egress, "safeFetch").mockResolvedValue({ status: 200, json: () => ({ sub, email: user.email, email_verified: true }) } as Awaited<ReturnType<typeof egress.safeFetch>>);
    const tokens = { accessToken: "synthetic", idToken: `h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s` };
    const identity = async (issuer: string) => {
      const provider = zitadelProvider({ issuer, clientId: "client", clientSecret: "synthetic" });
      const profile = (await provider.getUserInfo!(tokens))!;
      return { id: await provider.accountSubject!({ tokens, profile }) };
    };
    const a = await identity("https://issuer-a.example");
    const b = await identity("https://issuer-b.example");
    const ctx = await auth.$context;
    await ctx.internalAdapter.createAccount({ userId: user.id, providerId: "zitadel", accountId: String(a.id) });
    expect((await ctx.internalAdapter.findAccountOwnerByKey({ providerId: "zitadel", accountId: String(a.id) }))?.kind).toBe("owned");
    expect(await ctx.internalAdapter.findAccountOwnerByKey({ providerId: "zitadel", accountId: String(b.id) })).toBeNull();
    // A bare legacy subject is also refused, even under the currently configured issuer.
    await db.delete(schema.account).where(eq(schema.account.userId, user.id));
    await ctx.internalAdapter.createAccount({ userId: user.id, providerId: "zitadel", accountId: sub });
    expect(await ctx.internalAdapter.findAccountOwnerByKey({ providerId: "zitadel", accountId: String(a.id) })).toBeNull();
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  });
});
