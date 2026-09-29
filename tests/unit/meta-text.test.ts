import { describe, expect, it } from "vitest";
import { metaText } from "@/lib/meta-text";

describe("run inspector meta values (CXQ-03)", () => {
  it("renders structured values as JSON, never [object Object]", () => {
    const fallbackFrom = [{ provider: "openai", model: "fake-gpt-large", error: "AI_PROVIDER_ERROR" }];
    expect(metaText(fallbackFrom)).toBe(JSON.stringify(fallbackFrom));
    expect(metaText({ a: 1 })).toBe('{"a":1}');
    expect(metaText(fallbackFrom)).not.toContain("[object Object]");
  });
  it("keeps scalars as text and empties null/undefined", () => {
    expect(metaText("anthropic")).toBe("anthropic");
    expect(metaText(42)).toBe("42");
    expect(metaText(false)).toBe("false");
    expect(metaText(null)).toBe("");
    expect(metaText(undefined)).toBe("");
  });
});
