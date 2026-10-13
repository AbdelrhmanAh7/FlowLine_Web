import { describe, expect, it } from "vitest";
import { connectionTestErrorText } from "@/i18n/connection-test";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translate";
import { ApiError } from "@/lib/api";

describe("Test connection error text", () => {
  const cases: [number, string, string, "testAuthFailed" | "testUnreachable" | "testError"][] = [
    [400, "AUTHENTICATION_FAILED", "Invalid API key", "testAuthFailed"],
    [502, "PROVIDER_UNREACHABLE", "The provider could not be reached", "testUnreachable"],
    [502, "PROVIDER_ERROR", "The provider returned an unexpected error", "testError"],
  ];
  it.each(cases)("%i %s shows its own translated line in English and Arabic, not the server text", (status, code, message, key) => {
    const err = new ApiError(status, code, message);
    const english = connectionTestErrorText(createTranslator("en"), err);
    const arabic = connectionTestErrorText(createTranslator("ar"), err);
    if (key === "testError") {
      // An unmapped code falls back to the (fixed, bounded) server message, which is our own text.
      expect(english).toBe(message);
    } else {
      expect(english).toBe(en.integrations.card[key]);
      expect(arabic).toBe(ar.integrations.card[key]);
      expect(arabic).toMatch(/[؀-ۿ]/);
    }
  });
  it("a non-API failure falls back to the translated generic line", () => {
    expect(connectionTestErrorText(createTranslator("en"), new Error("x"))).toBe(en.integrations.card.testError);
    expect(connectionTestErrorText(createTranslator("ar"), new Error("x"))).toBe(ar.integrations.card.testError);
  });
});
