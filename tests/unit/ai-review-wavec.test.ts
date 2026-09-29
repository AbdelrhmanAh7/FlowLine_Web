import { describe, expect, it } from "vitest";
import { maxCostMicros, requestInputChars, type PriceSnapshot } from "@/ai/hub/pricing";
import { canCheckKey, keyCheckOf } from "@/ai/hub/protocols";
import { getProviderDef, isConnectable, PROVIDERS } from "@/ai/hub/registry";
import type { HubChatRequest } from "@/ai/hub/types";

/**
 * Regression tests for the Codex Wave C review (artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md), pure logic:
 * CXH-07 (one conservative request size for reservations, routing and agent limits) and CXH-11 (which providers'
 * listings authenticate the key).
 */
describe("CXH-07: the reserved input covers the complete protocol request", () => {
  const base: HubChatRequest = { system: "sys", maxTokens: 10, messages: [{ role: "user", content: "q" }] };
  const withCall = (args: Record<string, unknown>, result = "r"): HubChatRequest => ({
    ...base,
    messages: [
      { role: "user", content: "q" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "lookup", arguments: args }] },
      { role: "tool", toolCallId: "call_1", name: "lookup", content: result },
    ],
  });

  it("historical tool-call arguments, tool results and their ids are counted", () => {
    const big = "x".repeat(10_000);
    expect(requestInputChars(withCall({ q: big })) - requestInputChars(withCall({ q: "" }))).toBeGreaterThanOrEqual(10_000);
    expect(requestInputChars(withCall({}, big)) - requestInputChars(withCall({}, ""))).toBeGreaterThanOrEqual(10_000);
    // Never below the plain text lengths (the old sum), so it stays a conservative bound.
    const req = withCall({ q: "hello" });
    const textOnly = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
    expect(requestInputChars(req)).toBeGreaterThan(textOnly);
  });

  it("tools and the output schema are part of it", () => {
    const tools = [{ name: "t", description: "d".repeat(500), parameters: { type: "object" } }];
    expect(requestInputChars({ ...base, tools }) - requestInputChars(base)).toBeGreaterThanOrEqual(500);
    expect(requestInputChars({ ...base, schema: { description: "s".repeat(300) } }) - requestInputChars(base)).toBeGreaterThanOrEqual(300);
  });

  it("a larger request reserves more (the same size feeds maxCostMicros for every caller)", () => {
    const p: PriceSnapshot = { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 1_000_000, source: "workspace_price_table" };
    const small = maxCostMicros(p, requestInputChars(withCall({})), 10)!;
    const large = maxCostMicros(p, requestInputChars(withCall({ blob: "y".repeat(20_000) })), 10)!;
    expect(large - small).toBeGreaterThanOrEqual(10_000);
  });
});

describe("CXH-11: only an authenticated, non-billable check verifies a key", () => {
  it("every connectable provider with a model list declares whether that list authenticates", () => {
    for (const p of PROVIDERS.filter(isConnectable)) {
      if (p.discovery === "static-catalogue" || p.discovery === "none") continue;
      expect(p.listingAuth, p.id).toMatch(/^(key-required|public|unverified)$/);
    }
  });

  it("public listings (DeepInfra, Vercel) are not key checks; OpenRouter uses its authenticated key endpoint", () => {
    expect(keyCheckOf(getProviderDef("deepinfra")!)).toBe("public-listing");
    expect(keyCheckOf(getProviderDef("vercel-gateway")!)).toBe("public-listing");
    expect(canCheckKey(getProviderDef("deepinfra")!)).toBe(false);
    expect(canCheckKey(getProviderDef("vercel-gateway")!)).toBe(false);
    expect(keyCheckOf(getProviderDef("openrouter")!)).toBe("key-endpoint");
    expect(canCheckKey(getProviderDef("openrouter")!)).toBe(true);
    expect(keyCheckOf(getProviderDef("openai")!)).toBe("listing");
    expect(keyCheckOf(getProviderDef("zai")!)).toBe("none");
  });
});
