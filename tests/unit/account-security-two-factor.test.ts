// Regression guards for the review findings on issue #199 (account security page 4/4) and #318.
// Source-level assertions, like tests/unit/dv2-visual-fixes.test.ts: the account-security UI is exercised
// end to end by e2e/account-security.spec.ts.
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

  it("every Cancel control is an explicit type=\"button\" and disabled while requests are pending", () => {
    expect(readFileSync("src/components/ui/button.tsx", "utf8")).toContain('type = "button"');
    const cancels = src.match(/<Button[^>]*>\{t\("account\.security\.twoFactor\.cancel"\)\}<\/Button>/g) ?? [];
    expect(cancels).toHaveLength(3);
    for (const button of cancels) {
      expect(button).toContain('type="button"');
      expect(button).toContain('disabled={pending !== null}');
    }
  });

  it("Cancel discards both password fields, code, and increments requestId to drop stale responses", () => {
    const cancel = src.slice(src.indexOf("const cancel = () =>"), src.indexOf("const enable ="));
    expect(cancel).toContain("requestIdRef.current += 1");
    expect(cancel).toContain("takeSecret(enablePasswordRef.current)");
    expect(cancel).toContain("takeSecret(disablePasswordRef.current)");
    expect(cancel).toMatch(/codeRef\.current\.value = ""/);
    expect(cancel).not.toContain("api(");
  });

  it("enable, verify, and disable drop stale responses if cancelled mid-request", () => {
    expect(src).toContain("const reqId = ++requestIdRef.current;");
    expect(src).toContain("if (reqId !== requestIdRef.current) return;");
    // enable has guard
    const enableFn = src.slice(src.indexOf("const enable ="), src.indexOf("const verify ="));
    expect(enableFn).toContain("if (reqId !== requestIdRef.current) return;");
    expect(enableFn).toContain("setEnrolment({");

    // verify has guard
    const verifyFn = src.slice(src.indexOf("const verify ="), src.indexOf("const disable ="));
    expect(verifyFn).toContain("if (reqId !== requestIdRef.current) return;");

    // disable has guard
    const disableFn = src.slice(src.indexOf("const disable ="), src.indexOf("return ("));
    expect(disableFn).toContain("if (reqId !== requestIdRef.current) return;");
  });

  it("explains why TOTP secrets and backup codes enforce dir=\"ltr\" even in RTL contexts", () => {
    expect(src).toMatch(/dir="ltr"/);
    expect(src).toMatch(/RTL/);
    expect(src).toMatch(/credentials|tokens/);
  });

  it("explicitly sets dir=\"ltr\" on TOTP secret code element, backup codes list, and each code item", () => {
    expect(src).toMatch(/<code[^>]*id="two-factor-secret"[^>]*dir="ltr"/);
    expect(src).toMatch(/<ul[^>]*dir="ltr"[^>]*data-testid="backup-codes"/);
    expect(src).toMatch(/<li[^>]*dir="ltr"/);
    expect(src).toMatch(/<Input[^>]*id="two-factor-code"[^>]*dir="ltr"/);
  });

  it("uses an em-dash (—) in ar.json for account.security.twoFactor.backupCodes", () => {
    const arJson = JSON.parse(readFileSync("src/i18n/messages/ar.json", "utf8"));
    const msg = arJson.account.security.twoFactor.backupCodes;
    expect(msg).toContain("—");
    expect(msg).not.toMatch(/ [-\u05BE\u2212] /);
  });

  it("clears password and code inputs from DOM upon submission for enable, verify, and disable", () => {
    const enableFn = src.slice(src.indexOf("const enable ="), src.indexOf("const verify ="));
    expect(enableFn).toContain("takeSecret(enablePasswordRef.current)");

    const verifyFn = src.slice(src.indexOf("const verify ="), src.indexOf("const disable ="));
    expect(verifyFn).toContain('codeRef.current.value = ""');

    const disableFn = src.slice(src.indexOf("const disable ="), src.indexOf("return ("));
    expect(disableFn).toContain("takeSecret(disablePasswordRef.current)");
  });

  it("enforces complete API contract: enable with password & Flowline issuer, verify with code, disable with password only", () => {
    expect(src).toContain('api<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", { method: "POST", json: { password, issuer: "Flowline" } })');
    expect(src).toContain('api("/api/auth/two-factor/verify-totp", { method: "POST", json: { code } })');
    expect(src).toContain('api("/api/auth/two-factor/disable", { method: "POST", json: { password } })');
  });

  it("enable and disable read their password through separate refs", () => {
    expect(src).toContain("<SecretInput ref={enablePasswordRef}");
    expect(src).toContain("<SecretInput ref={disablePasswordRef}");
  });

  it("simulates mid-request cancellation: late response is ignored and enrolment state is not set", async () => {
    // Model the requestId guard behavior in two-factor-card
    const requestIdRef = { current: 0 };
    let enrolment: unknown = null;
    let pending: string | null = null;

    const mockApi = () =>
      new Promise<{ totpURI: string; backupCodes: string[] }>((resolve) => {
        setTimeout(() => {
          resolve({ totpURI: "otpauth://totp/Flowline?secret=JBSWY3DPEHPK3PXP", backupCodes: ["code1", "code2"] });
        }, 50);
      });

    const enable = async () => {
      const reqId = ++requestIdRef.current;
      pending = "enable";
      try {
        const r = await mockApi();
        if (reqId !== requestIdRef.current) return;
        enrolment = r;
      } finally {
        if (reqId === requestIdRef.current) {
          pending = null;
        }
      }
    };

    const cancel = () => {
      requestIdRef.current += 1;
      enrolment = null;
      pending = null;
    };

    // Trigger enable
    const inFlightPromise = enable();
    expect(pending).toBe("enable");

    // Cancel mid-request before promise resolves
    cancel();
    expect(pending).toBeNull();
    expect(enrolment).toBeNull();

    // Await promise completion
    await inFlightPromise;

    // Enrolment must NOT have been updated by late resolving response
    expect(enrolment).toBeNull();
  });
});
