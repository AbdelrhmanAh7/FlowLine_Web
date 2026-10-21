// Regression guards for the review findings on issue #199 (account security page 4/4). Source-level assertions,
// like tests/unit/dv2-visual-fixes.test.ts: the account-security UI is exercised end to end by e2e/account-security.spec.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CARD = "src/app/account/security/two-factor-card.tsx";

describe("account security two-factor card", () => {
  const src = readFileSync(CARD, "utf8");

  it("Disable posts only the account password to better-auth's existing endpoint (no code field)", () => {
    expect(src).toContain('api("/api/auth/two-factor/disable", { method: "POST", json: { password } })');
    const call = src.slice(src.indexOf('"/api/auth/two-factor/disable"'));
    expect(call.slice(0, call.indexOf(";"))).not.toContain("code");
    // better-auth 1.7.6 defines this endpoint as POST with a password-only body, so no server code is added here.
    const plugin = readFileSync("node_modules/better-auth/dist/plugins/two-factor/index.mjs", "utf8");
    expect(plugin).toMatch(/disableTwoFactorBodySchema = [^\n]*password/);
    expect(plugin).not.toMatch(/disableTwoFactorBodySchema = [^\n]*code/);
  });

  it("every Cancel control is an explicit type=\"button\" and carries disabled={pending !== null}", () => {
    expect(readFileSync("src/components/ui/button.tsx", "utf8")).toContain('type = "button"');
    const cancels = src.match(/<Button[^>]*>\{t\("account\.security\.twoFactor\.cancel"\)\}<\/Button>/g) ?? [];
    expect(cancels).toHaveLength(3);
    for (const button of cancels) {
      expect(button).toContain('type="button"');
      expect(button).toContain("disabled={pending !== null}");
    }
  });

  it("Disable and Enable trigger buttons are disabled while pending", () => {
    expect(src).toContain("setAskDisable(true)} disabled={pending !== null}");
    expect(src).toContain("setAskPassword(true)} disabled={pending !== null}");
  });

  it("Cancel discards both password fields and any pending code without a request", () => {
    const cancel = src.slice(src.indexOf("const cancel = () =>"), src.indexOf("const enable ="));
    expect(cancel).toContain("takeSecret(enablePasswordRef.current)");
    expect(cancel).toContain("takeSecret(disablePasswordRef.current)");
    expect(cancel).toMatch(/codeRef\.current\.value = ""/);
    expect(cancel).not.toContain("api(");
  });

  it("enable and disable read their password through separate refs", () => {
    expect(src).toContain("<SecretInput ref={enablePasswordRef}");
    expect(src).toContain("<SecretInput ref={disablePasswordRef}");
  });
});
