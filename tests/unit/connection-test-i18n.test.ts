import { describe, expect, it } from "vitest";
import { connectionTestErrorText } from "@/i18n/connection-test";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translate";
import { ApiError } from "@/lib/api";

describe("Test connection error text", () => {
  const cases: [number, string, string, string][] = [
    [400, "AUTHENTICATION_FAILED", "Invalid API key", "integrations.card.testAuthFailed"],
    [502, "PROVIDER_UNREACHABLE", "The provider could not be reached", "integrations.card.testUnreachable"],
    [502, "PROVIDER_ERROR", "The provider returned an unexpected error", "integrations.card.testProviderError"],
    [400, "EGRESS_BLOCKED", "Address not allowed (server text)", "integrations.oauth.codes.EGRESS_BLOCKED"],
  ];
  it.each(cases)("%i %s shows its own translated line in English and Arabic, not the server text", (status, code, message, key) => {
    const err = new ApiError(status, code, message);
    const english = connectionTestErrorText(createTranslator("en"), err);
    const arabic = connectionTestErrorText(createTranslator("ar"), err);
    expect(english).toBe(createTranslator("en")(key as never));
    expect(arabic).toBe(createTranslator("ar")(key as never));
    expect(english).not.toBe("");
    expect(arabic).not.toBe("");
    expect(arabic).not.toBe(message);
    expect(arabic).toMatch(/[؀-ۿ]/);
  });
  it("a non-API failure falls back to the translated generic line", () => {
    expect(connectionTestErrorText(createTranslator("en"), new Error("x"))).toBe(en.integrations.card.testError);
    expect(connectionTestErrorText(createTranslator("ar"), new Error("x"))).toBe(ar.integrations.card.testError);
  });
});
