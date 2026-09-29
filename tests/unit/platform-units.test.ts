import { describe, expect, it } from "vitest";
import { boundedErrorCode } from "@/server/oauth-client";
import { familyOf, legacyEnvVars, purposeDef, PURPOSES } from "@/server/platform-purposes";
import { SETTING_SCHEMAS } from "@/server/platform-setting-schemas";
import { base32Decode, hotp, totpCodeFor } from "@/server/totp";

describe("TOTP (RFC 6238 parameters used by the two-factor plugin)", () => {
  it("matches the RFC 6238 SHA-1 test vectors (6 digits)", () => {
    const secret = "12345678901234567890";
    expect(totpCodeFor(secret, 59_000)).toBe("287082");
    expect(totpCodeFor(secret, 1_111_111_109_000)).toBe("081804");
    expect(totpCodeFor(secret, 2_000_000_000_000)).toBe("279037");
    expect(hotp(secret, 0)).toBe("755224"); // RFC 4226 HOTP vector
  });
  it("decodes the base32 secret of an otpauth URI back to the key bytes", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").toString("utf8")).toBe("12345678901234567890");
  });
});

describe("bounded provider error codes (never a provider's free text)", () => {
  it("keeps only known OAuth error codes", () => {
    expect(boundedErrorCode("invalid_grant")).toBe("invalid_grant");
    expect(boundedErrorCode("invalid_client")).toBe("invalid_client");
    expect(boundedErrorCode("FLCANARY secret leaked in error")).toBe("provider_error");
    expect(boundedErrorCode(undefined)).toBe("provider_error");
    expect(boundedErrorCode({ nested: "x" })).toBe("provider_error");
  });
});

describe("platform purpose catalogue", () => {
  it("covers sign-in, every OAuth integration family, email and sandbox billing — endpoints are never configurable", () => {
    for (const p of ["signin.google", "signin.github", "integration.google", "integration.slack", "integration.github", "email.resend", "email.postmark", "billing.paddle.sandbox", "billing.paddle.sandbox.webhook", "billing.stripe.test", "billing.stripe.test.webhook"]) {
      expect(purposeDef(p), p).toBeDefined();
    }
    // Admins supply a public id + a secret only; no purpose carries a URL, scope or auth-method field.
    for (const d of PURPOSES) expect(Object.keys(d).sort()).toEqual(["env", "graceMs", "kind", "provider", "publicId", "purpose", "secret"]);
    expect(familyOf("gmail")).toBe("google");
    expect(familyOf("google_sheets")).toBe("google");
    expect(familyOf("slack")).toBe("slack");
    expect(familyOf("github")).toBe("github");
    expect(familyOf("notion")).toBeNull();
  });
  it("Slack has no rotation overlap (its old secret dies immediately); Google/GitHub keep the previous secret", () => {
    expect(purposeDef("integration.slack")!.graceMs).toBe(0);
    expect(purposeDef("integration.google")!.graceMs).toBeGreaterThan(0);
    expect(purposeDef("integration.github")!.graceMs).toBeGreaterThan(0);
  });
  it("the Paddle client-side token must be a sandbox token (a live token can't even be stored)", () => {
    const d = purposeDef("billing.paddle.sandbox")!;
    expect(d.publicId!.pattern.test("test_0123456789abcdef")).toBe(true);
    expect(d.publicId!.pattern.test("live_0123456789abcdef")).toBe(false);
  });
  it("lists the legacy env vars the panel tells operators to remove", () => {
    const vars = legacyEnvVars();
    for (const v of ["GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "SLACK_OAUTH_CLIENT_SECRET", "FLOWLINE_EMAIL_RESEND_KEY", "FLOWLINE_BILLING_PADDLE_KEY", "FLOWLINE_BILLING_PLANS", "FLOWLINE_EMAIL_ALLOWED_RECIPIENTS"]) expect(vars).toContain(v);
    expect(vars).not.toContain("FLOWLINE_BILLING_ALLOW_LIVE"); // the live-payments gate stays operator env
  });
});

describe("Caddy access-log redaction (deploy/beta/Caddyfile)", () => {
  it("redacts OAuth code/state/error* values and bearer tokens from logged URIs, and sets no-referrer on callbacks/admin", async () => {
    const { readFileSync } = await import("node:fs");
    const caddy = readFileSync("deploy/beta/Caddyfile", "utf8");
    const m = /request>uri regexp "([^"]+)" "([^"]+)"/.exec(caddy)!;
    const re = new RegExp(m[1]!, "g");
    const rep = m[2]!.replace(/\$\{(\d)\}/g, "$$$1");
    const redact = (u: string) => u.replace(re, rep);
    const out = redact("/api/oauth/callback?code=4/0AX-secret-code&state=FLCANARY_state&scope=x");
    expect(out).not.toContain("secret-code");
    expect(out).not.toContain("FLCANARY_state");
    expect(out).toContain("scope=x");
    expect(redact("/api/auth/callback/google?error=access_denied&error_description=FLCANARY_desc")).not.toMatch(/FLCANARY|access_denied/);
    expect(redact("/verify-email?token=abc123")).toBe("/verify-email?token=REDACTED");
    expect(redact("/invite/tok_abc?x=1")).toBe("/invite/REDACTED?x=1");
    expect(redact("/w/acme/runs?postcode=12345")).toBe("/w/acme/runs?postcode=12345"); // only exact parameter names
    expect(caddy).toMatch(/@sensitive path \/api\/oauth\/callback \/api\/auth\/callback\/\* \/api\/sso\/callback \/admin \/admin\/\* \/api\/platform\/\*/);
    expect(caddy).toMatch(/header @sensitive \{[^}]*Referrer-Policy "no-referrer"/);
  });
});

describe("platform settings validation", () => {
  it("rejects invalid plans / allowlists and accepts valid ones", () => {
    const plan = { id: "free", name: "Free", providerPriceId: "pri_1", entitlements: { maxMonthlyExecutions: 10, monthlyUsageCapMicros: null, maxConcurrentRuns: 1 } };
    expect(SETTING_SCHEMAS["billing.plans"].safeParse({ plans: [plan], freePlanId: "free" }).success).toBe(true);
    expect(SETTING_SCHEMAS["billing.plans"].safeParse({ plans: [plan], freePlanId: "pro" }).success).toBe(false);
    expect(SETTING_SCHEMAS["billing.plans"].safeParse({ plans: [plan, plan], freePlanId: "free" }).success).toBe(false);
    expect(SETTING_SCHEMAS["email.allowed_recipients"].safeParse(["a@example.test", "@flowline.test", "*.example.test"]).success).toBe(true);
    expect(SETTING_SCHEMAS["email.allowed_recipients"].safeParse(["not an address"]).success).toBe(false);
    expect(SETTING_SCHEMAS["billing.provider"].safeParse("live-stripe").success).toBe(false);
  });
});
