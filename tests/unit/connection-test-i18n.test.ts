import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectionTestErrorText, testConnectionButtonText, testConnectionSuccessText } from "@/i18n/connection-test";
import { createTranslator } from "@/i18n/translate";
import { ApiError } from "@/lib/api";

describe("Test connection UI and error text", () => {
  const cases: [number, string, string][] = [
    [400, "AUTHENTICATION_FAILED", "Invalid API key"],
    [502, "PROVIDER_UNREACHABLE", "The provider could not be reached"],
    [502, "PROVIDER_ERROR", "The provider returned an unexpected error"],
    [400, "EGRESS_BLOCKED", "Address not allowed (server text)"],
    [403, "NOT_CONNECTION_OWNER", "Only the connection owner can test it"],
    [404, "CONNECTION_NOT_FOUND", "Connection not found"],
    [404, "UNKNOWN_PROVIDER", "Provider not found"],
    [400, "TEST_NOT_SUPPORTED", "Test connection is not available for OAuth connections"],
  ];

  it.each(cases)("%i %s shows its own translated line in English and Arabic, not the server text", (status, code, message) => {
    const err = new ApiError(status, code, message);
    const english = connectionTestErrorText(createTranslator("en"), err);
    const arabic = connectionTestErrorText(createTranslator("ar"), err);
    expect(english).not.toBe("");
    expect(arabic).not.toBe("");
    expect(arabic).not.toBe(message);
    expect(arabic).toMatch(/[؀-ۿ]/);
  });

  it("every code the Test connection route throws has a translated line, so Arabic never shows the server text", () => {
    const sources = ["src/server/connection-test.ts", "src/integrations/connection-test.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    const codes = new Set([...sources.matchAll(/new HttpError\(\d{3}, "([A-Z_]+)"/g)].map((m) => m[1]!));
    expect(codes.size).toBeGreaterThanOrEqual(8);
    for (const code of codes) {
      expect(connectionTestErrorText(createTranslator("ar"), new ApiError(400, code, "English server text")), code).toMatch(/[؀-ۿ]/);
    }
  });

  it("a non-API failure falls back to the translated generic line", () => {
    expect(connectionTestErrorText(createTranslator("en"), new Error("x"))).toBe("Couldn't test the connection");
    expect(connectionTestErrorText(createTranslator("ar"), new Error("x"))).toBe("تعذّر اختبار الاتصال");
  });

  it("button and success toasts are translated in English and Arabic", () => {
    const enT = createTranslator("en");
    const arT = createTranslator("ar");
    expect(testConnectionButtonText(enT)).toBe("Test connection");
    expect(testConnectionButtonText(arT)).toBe("اختبار الاتصال");
    expect(testConnectionSuccessText(enT, "Alice A Mizano")).toBe("Connection OK — Alice A Mizano");
    expect(testConnectionSuccessText(arT, "Alice A Mizano")).toBe("الاتصال سليم — Alice A Mizano");
  });
});
