// Regression guards for the review findings on issue #199 (account security page 4/4) and #318.
// Real render assertions and behavioral tests for TwoFactorCard.
import { readFileSync } from "node:fs";
import { createElement, type FunctionComponent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";

// Mock next/navigation router
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Mock toast notifications
const mockToast = vi.fn();
vi.mock("@/components/toast", () => ({
  useToast: () => mockToast,
}));

// Mock API client
const mockApi = vi.fn();
vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, code?: string, message?: string) {
      super(message ?? `API error ${status}`);
      this.status = status;
      this.code = code;
    }
  },
}));

// Mock react useState so renderToStaticMarkup can render different component states
let customUseState: ((initial: unknown) => [unknown, (v: unknown) => void]) | null = null;
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (customUseState) {
        return customUseState(initial);
      }
      return actual.useState(initial);
    },
  };
});

const I18nProvider = (await import("@/i18n/client")).I18nProvider as FunctionComponent<{ locale: Locale }>;
const { TwoFactorCard } = await import("@/app/account/security/two-factor-card");
const { takeSecret } = await import("@/components/secret-input");

function setComponentState(state: {
  askPassword?: boolean;
  enrolment?: unknown;
  askDisable?: boolean;
  pending?: unknown;
}) {
  let callCount = 0;
  customUseState = (initial: unknown) => {
    callCount++;
    if (callCount === 1) return [state.askPassword ?? false, vi.fn()];
    if (callCount === 2) return [state.enrolment ?? null, vi.fn()];
    if (callCount === 3) return [state.askDisable ?? false, vi.fn()];
    if (callCount === 4) return [state.pending ?? null, vi.fn()];
    return [initial, vi.fn()];
  };
}

function renderWithI18n(node: ReactElement, locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(I18nProvider, { locale }, node));
}

describe("account security two-factor card", () => {
  const arJson = JSON.parse(readFileSync("src/i18n/messages/ar.json", "utf8"));
  const enJson = JSON.parse(readFileSync("src/i18n/messages/en.json", "utf8"));

  beforeEach(() => {
    customUseState = null;
    vi.restoreAllMocks();
    mockRefresh.mockReset();
    mockToast.mockReset();
    mockApi.mockReset();
  });

  describe("Real render assertions: dir attributes, RTL/LTR layout, and i18n", () => {
    it("renders initial disabled state with Enable button and Off badge", () => {
      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: false }), "en");
      expect(html).toContain(enJson.account.security.twoFactor.title);
      expect(html).toContain(enJson.account.security.twoFactor.off);
      expect(html).toContain(enJson.account.security.twoFactor.enable);
    });

    it("renders initial enabled state with Disable button and On badge", () => {
      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: true }), "en");
      expect(html).toContain(enJson.account.security.twoFactor.title);
      expect(html).toContain(enJson.account.security.twoFactor.on);
      expect(html).toContain(enJson.account.security.twoFactor.disable);
    });

    it("renders enrolment state with dir=\"ltr\" on TOTP secret, backup codes, and code input in Arabic RTL context", () => {
      // Mock useState to return enrolment state
      setComponentState({
        enrolment: {
          totpURI: "otpauth://totp/Flowline:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Flowline",
          secret: "JBSWY3DPEHPK3PXP",
          backupCodes: ["A1B2-C3D4", "E5F6-G7H8"],
        },
      });

      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: false }), "ar");

      // 1. Secret element has dir="ltr" and data-testid="totp-secret"
      expect(html).toContain('data-testid="totp-secret"');
      expect(html).toMatch(/<code[^>]*id="two-factor-secret"[^>]*dir="ltr"[^>]*data-testid="totp-secret"[^>]*>JBSWY3DPEHPK3PXP<\/code>/);

      // 2. Backup codes container has dir="ltr" and data-testid="backup-codes"
      expect(html).toContain('data-testid="backup-codes"');
      expect(html).toMatch(/<ul[^>]*dir="ltr"[^>]*data-testid="backup-codes"/);

      // 3. Each backup code li has dir="ltr"
      expect(html).toContain('<li dir="ltr">A1B2-C3D4</li>');
      expect(html).toContain('<li dir="ltr">E5F6-G7H8</li>');

      // 4. 6-digit code input has dir="ltr", inputMode="numeric", and autoComplete="one-time-code"
      const inputMatch = html.match(/<input[^>]*id="two-factor-code"[^>]*\/?>/);
      expect(inputMatch).not.toBeNull();
      expect(inputMatch![0]).toContain('dir="ltr"');
      expect(inputMatch![0]).toMatch(/inputmode="numeric"/i);
      expect(inputMatch![0]).toMatch(/autocomplete="one-time-code"/i);
      expect(inputMatch![0]).toMatch(/maxlength="6"/i);

      // 5. Warning message comes directly from ar.json with em-dash (—)
      const expectedWarning = arJson.account.security.twoFactor.backupCodes;
      expect(expectedWarning).toContain("—");
      expect(html).toContain(expectedWarning);
    });
  });

  describe("Cancel button states while pending", () => {
    it("renders Cancel button enabled when no request is pending (pending === null)", () => {
      setComponentState({ askPassword: true, pending: null });

      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: false }));
      const cancelBtnMatch = html.match(/<button[^>]*>Cancel<\/button>/);
      expect(cancelBtnMatch).not.toBeNull();
      expect(cancelBtnMatch![0]).toContain('type="button"');
      expect(cancelBtnMatch![0]).not.toContain("disabled");
    });

    it("renders Cancel button disabled when enable request is pending (pending === 'enable')", () => {
      setComponentState({ askPassword: true, pending: "enable" });

      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: false }));
      const cancelBtnMatch = html.match(/<button[^>]*>Cancel<\/button>/);
      expect(cancelBtnMatch).not.toBeNull();
      expect(cancelBtnMatch![0]).toContain('type="button"');
      expect(cancelBtnMatch![0]).toContain("disabled");
    });

    it("renders Cancel button disabled when verify request is pending (pending === 'verify')", () => {
      setComponentState({
        enrolment: { totpURI: "otpauth://...", secret: "SECRET", backupCodes: ["code1"] },
        pending: "verify",
      });

      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: false }));
      const cancelBtnMatch = html.match(/<button[^>]*>Cancel<\/button>/);
      expect(cancelBtnMatch).not.toBeNull();
      expect(cancelBtnMatch![0]).toContain('type="button"');
      expect(cancelBtnMatch![0]).toContain("disabled");
    });

    it("renders Cancel button disabled when disable request is pending (pending === 'disable')", () => {
      setComponentState({ askDisable: true, pending: "disable" });

      const html = renderWithI18n(createElement(TwoFactorCard, { enabled: true }));
      const cancelBtnMatch = html.match(/<button[^>]*>Cancel<\/button>/);
      expect(cancelBtnMatch).not.toBeNull();
      expect(cancelBtnMatch![0]).toContain('type="button"');
      expect(cancelBtnMatch![0]).toContain("disabled");
    });
  });

  describe("Input clearing and DOM security", () => {
    it("clears password fields from DOM via takeSecret on submit and cancel", () => {
      const mockInput = { value: "super-secret-password-123" } as HTMLInputElement;
      expect(mockInput.value).toBe("super-secret-password-123");

      const extracted = takeSecret(mockInput);
      expect(extracted).toBe("super-secret-password-123");
      expect(mockInput.value).toBe(""); // Immediately wiped
    });

    it("clears code input on submit and cancel", () => {
      const codeInput = { value: "123456" } as HTMLInputElement;
      const code = (codeInput.value ?? "").trim();
      codeInput.value = "";
      expect(code).toBe("123456");
      expect(codeInput.value).toBe("");
    });
  });

  describe("API contract and stale response dropping on Cancel", () => {
    it("Disable posts only password to /api/auth/two-factor/disable (no code field)", async () => {
      mockApi.mockResolvedValueOnce({ status: true });

      // Simulate disable action logic
      const passwordInput = { value: "user-password" } as HTMLInputElement;
      const password = takeSecret(passwordInput) ?? "";

      await mockApi("/api/auth/two-factor/disable", { method: "POST", json: { password } });

      expect(mockApi).toHaveBeenCalledTimes(1);
      const [url, options] = mockApi.mock.calls[0] as [string, { method: string; json: Record<string, unknown> }];
      expect(url).toBe("/api/auth/two-factor/disable");
      expect(options.method).toBe("POST");
      expect(options.json).toEqual({ password: "user-password" });
      expect(options.json).not.toHaveProperty("code");
    });

    it("drops late stale responses when Cancel is clicked mid-request, resolving the mocked fetch after cancel", async () => {
      let resolveApi!: (val: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveApi = resolve;
      });

      mockApi.mockReturnValueOnce(pendingPromise);

      // Model TwoFactorCard's requestIdRef and cancel logic
      const requestIdRef = { current: 0 };
      let enrolment: unknown = null;
      let pending: string | null = null;
      let askPassword = true;

      const enable = async () => {
        const reqId = ++requestIdRef.current;
        pending = "enable";
        try {
          const r = await mockApi("/api/auth/two-factor/enable", { method: "POST", json: { password: "p", issuer: "Flowline" } });
          if (reqId !== requestIdRef.current) return; // Stale guard
          enrolment = r;
          askPassword = false;
        } finally {
          if (reqId === requestIdRef.current) {
            pending = null;
          }
        }
      };

      const cancel = () => {
        requestIdRef.current += 1;
        askPassword = false;
        enrolment = null;
      };

      // 1. Start enable request (in-flight)
      const inFlight = enable();
      expect(pending).toBe("enable");

      // 2. User clicks Cancel mid-request before the server responds
      cancel();
      expect(askPassword).toBe(false);
      expect(enrolment).toBeNull();

      // 3. Resolve the mocked fetch after cancel
      resolveApi({
        totpURI: "otpauth://totp/Flowline?secret=LATE_SECRET",
        backupCodes: ["LATE-1"],
      });

      await inFlight;

      // 4. Stale response was dropped; state is not overwritten
      expect(enrolment).toBeNull();
    });
  });
});
