import { describe, expect, it } from "vitest";
import { platformRedirectUris } from "@/server/platform-uris";
import { purposeDef, SETTING_KEYS } from "@/server/platform-purposes";

describe("platform ZITADEL setup contract", () => {
  it("exposes one owner-managed sign-in purpose and the Better Auth callback", () => {
    const purpose = purposeDef("signin.zitadel")!;
    expect(purpose.kind).toBe("oauth_signin");
    expect(purpose.env.secret).toBe("");
    expect(SETTING_KEYS).toContain("signin.zitadel.issuer");
    const before = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://flowline.example";
    try { expect(platformRedirectUris().signin.zitadel).toBe("https://flowline.example/api/auth/callback/zitadel"); }
    finally { if (before === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = before; }
  });
});
