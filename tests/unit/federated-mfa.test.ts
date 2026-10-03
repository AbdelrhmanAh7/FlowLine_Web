import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import { federatedDestination, isFederatedSignInPath } from "@/server/federated-mfa";
import { federatedProviderId } from "@/server/federated-link";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
afterEach(() => vi.unstubAllEnvs());
describe("federated challenge boundaries", () => {
  it("ships readable Arabic source copy and English for consent, ownership and step-up", () => {
    for (const key of Object.keys(ar.auth).filter((k) => k.startsWith("ssoLink") || k.startsWith("ssoMailbox") || k.startsWith("federatedFactor") || k === "ssoOwnershipRequired" || k === "ssoRestart" || k === "ssoAccountExists")) {
      expect(ar.auth[key as keyof typeof ar.auth], key).toMatch(/\p{Script=Arabic}/u);
      expect(en.auth[key as keyof typeof en.auth], key).toMatch(/[A-Za-z]/);
    }
    expect(ar.errors.PLATFORM_MFA_REQUIRED).toMatch(/\p{Script=Arabic}/u);
  });
  it("covers all callback families and direct social/OAuth sign-ins", () => {
    for (const path of ["/callback/google", "/callback/github", "/callback/zitadel", "/oauth2/callback/zitadel", "/sign-in/social", "/sign-in/oauth2"])
      expect(isFederatedSignInPath(path), path).toBe(true);
    for (const path of ["/get-session", "/link-social", "/sign-in/email", "/two-factor/verify-totp", ""])
      expect(isFederatedSignInPath(path), path).toBe(false);
  });
  it("matches the route patterns Better Auth hooks actually receive and resolves the provider from params/body", () => {
    // Inside hooks ctx.path is the pattern ("/callback/:id"), not the URL; the provider id is a route param.
    for (const path of ["/callback/:id", "/oauth2/callback/:providerId"]) expect(isFederatedSignInPath(path), path).toBe(true);
    expect(federatedProviderId({ params: { id: "github" } })).toBe("github");
    expect(federatedProviderId({ params: { providerId: "zitadel" } })).toBe("zitadel");
    expect(federatedProviderId({ body: { provider: "google" } })).toBe("google");
    expect(federatedProviderId({ params: { id: "github" }, body: { provider: "google" } })).toBe("github");
    for (const ctx of [{}, { params: {}, body: null }, { body: { provider: 7 } }]) expect(federatedProviderId(ctx)).toBe("");
  });
  it("preserves same-origin destinations and refuses open redirects", () => {
    vi.stubEnv("FLOWLINE_PUBLIC_URL", "https://flowline.example");
    vi.stubEnv("BETTER_AUTH_URL", "https://flowline.example");
    expect(federatedDestination("https://flowline.example/w/alpha/flows?q=1")).toBe("/w/alpha/flows?q=1");
    expect(federatedDestination("/w/alpha/flows")).toBe("/w/alpha/flows");
    for (const next of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "/\u0000x", "bad-url"])
      expect(federatedDestination(next)).toBe("/app");
  });
});
