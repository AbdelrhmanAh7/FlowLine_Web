import { afterEach, describe, expect, it, vi } from "vitest";
import { zitadelAccountId, zitadelProvider } from "@/server/zitadel-auth";
import * as egress from "@/server/egress";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("M7: persistent global ZITADEL identity", () => {
  it("keys the actual userinfo result by issuer and subject, preserving the signed subject check", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://flowline.example");
    vi.spyOn(egress, "safeFetch").mockResolvedValue({ status: 200, json: () => ({ sub: "same-subject", email: "owner@example.test", email_verified: true }) } as Awaited<ReturnType<typeof egress.safeFetch>>);
    const tokens = { accessToken: "synthetic", idToken: `header.${Buffer.from(JSON.stringify({ sub: "same-subject" })).toString("base64url")}.signature` };
    const identity = async (issuer: string, clientId = "c") => zitadelProvider({ issuer, clientId, clientSecret: "synthetic" }).getUserInfo!(tokens);
    const original = await identity("https://first.example");
    const replacement = await identity("https://second.example");
    expect(original?.id).not.toBe(replacement?.id);
    expect(original?.id).not.toBe("same-subject");
    expect(original?.id).toBe((await identity("https://first.example", "rotated-client"))?.id);
    expect(original?.id).toBe(zitadelAccountId("https://first.example", "same-subject"));
    // OIDC callbacks use accountSubject, rather than userinfo.id, in this version.
    const a = zitadelProvider({ issuer: "https://first.example", clientId: "c", clientSecret: "s" });
    const b = zitadelProvider({ issuer: "https://second.example", clientId: "c", clientSecret: "s" });
    expect(a.accountSubject!({ tokens, profile: original! })).toBe(original!.id);
    expect(b.accountSubject!({ tokens, profile: replacement! })).not.toBe(original!.id);
    expect(await zitadelProvider({ issuer: "https://first.example", clientId: "c", clientSecret: "s" }).getUserInfo!({ ...tokens, idToken: `h.${Buffer.from(JSON.stringify({ sub: "different" })).toString("base64url")}.s` })).toBeNull();
  });
});
