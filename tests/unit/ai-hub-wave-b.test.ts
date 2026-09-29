import { describe, expect, it } from "vitest";
import { CATALOGUE, CATALOGUE_DATE, catalogueKey, staticModels } from "@/ai/hub/catalogue";
import { costMicros, isVerifiedZeroPrice, maxCostMicros, resolvePrice, type PriceSnapshot } from "@/ai/hub/pricing";
import { getProviderDef, isConnectable, PROVIDERS, protocolFor, RETIRED_NOT_ADDED } from "@/ai/hub/registry";
import { capabilityProblem, FALLBACK_ELIGIBLE, FALLBACK_NEVER, mayFallback, privacyAllows } from "@/ai/hub/routing";
import { validateSettings } from "@/ai/hub/transport";
import { UNKNOWN_CAPABILITIES, type ResolvedRoute } from "@/ai/hub/types";

const u = (o: Partial<{ inputTokens: number; outputTokens: number; cacheReadTokens: number | null; cacheWriteTokens: number | null; reasoningTokens: number | null }> = {}) => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, ...o });

describe("pricing (Wave B rules)", () => {
  it("a catalogue price in another currency, or for another region, is UNKNOWN (never converted or reused)", () => {
    const usd = { inputPerMTokMicros: 1, outputPerMTokMicros: 2, currency: "USD" };
    expect(resolvePrice({}, "p", "m", usd, { currency: "EUR" })).toBeNull();
    expect(resolvePrice({}, "p", "m", usd, { currency: "USD" })).toMatchObject({ source: "catalogue" });
    const sg = { ...usd, region: "ap-southeast-1" };
    expect(resolvePrice({}, "dashscope", "q", sg, { currency: "USD", region: "cn-beijing" })).toBeNull();
    expect(resolvePrice({}, "dashscope", "q", sg, { currency: "USD", region: "ap-southeast-1" })).not.toBeNull();
    // The owner's own table (in the workspace currency) always wins.
    expect(resolvePrice({ "ai:p/m": { inputPerMTokMicros: 5, outputPerMTokMicros: 6 } }, "p", "m", usd, { currency: "EUR" })).toMatchObject({ source: "workspace_price_table" });
  });

  it("cache writes without their own price make the cost unknown; long-context tiers switch prices (and an unpriced tier is unknown)", () => {
    const p: PriceSnapshot = { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 2_000_000, source: "catalogue" };
    expect(costMicros(p, u({ inputTokens: 10, cacheWriteTokens: 5 }))).toBeNull();
    expect(costMicros({ ...p, cacheWritePerMTokMicros: 3_000_000 }, u({ inputTokens: 1_000_000, cacheWriteTokens: 1_000_000 }))).toBe(4_000_000);
    const lc: PriceSnapshot = { ...p, longContext: { aboveInputTokens: 100, inputPerMTokMicros: 2_000_000, outputPerMTokMicros: 4_000_000 } };
    expect(costMicros(lc, u({ inputTokens: 100, outputTokens: 1_000_000 }))).toBe(2_000_100);
    expect(costMicros(lc, u({ inputTokens: 101, outputTokens: 1_000_000 }))).toBe(4_000_202);
    expect(maxCostMicros(lc, 1_000, 10)).toBe(Math.ceil((516 * 2_000_000 + 10 * 4_000_000) / 1_000_000));
    const unpricedTier: PriceSnapshot = { ...p, longContext: { aboveInputTokens: 100, inputPerMTokMicros: -1, outputPerMTokMicros: -1 } };
    expect(maxCostMicros(unpricedTier, 1_000, 10)).toBeNull();
    expect(costMicros(unpricedTier, u({ inputTokens: 50 }))).toBe(50);
  });

  it("FREE means a VERIFIED zero price from the catalogue or a documented listing — not an owner-entered zero, not unknown", () => {
    expect(isVerifiedZeroPrice({ inputPerMTokMicros: 0, outputPerMTokMicros: 0, source: "catalogue" })).toBe(true);
    expect(isVerifiedZeroPrice({ inputPerMTokMicros: 0, outputPerMTokMicros: 0, source: "workspace_price_table" })).toBe(false);
    expect(isVerifiedZeroPrice({ inputPerMTokMicros: 0, outputPerMTokMicros: 1, source: "catalogue" })).toBe(false);
    expect(isVerifiedZeroPrice({ inputPerMTokMicros: 0, outputPerMTokMicros: 0, perCallMicros: 5, source: "catalogue" })).toBe(false);
    expect(isVerifiedZeroPrice(null)).toBe(false);
  });
});

describe("curated catalogue provenance", () => {
  it("every price carries an official source URL (one of the provider's cited docs domains), the check date and USD", () => {
    for (const e of CATALOGUE) {
      const def = getProviderDef(e.provider)!;
      expect(isConnectable(def), e.provider).toBe(true);
      if (!e.pricing) continue;
      expect(e.pricing.currency, e.modelId).toBe("USD");
      expect(e.pricing.verifiedAt, e.modelId).toBe(CATALOGUE_DATE);
      expect(e.pricing.sourceUrl, e.modelId).toMatch(/^https:\/\//);
      const host = new URL(e.pricing.sourceUrl!).hostname;
      const cited = [...def.sources.map((s) => new URL(s.url).hostname), def.termsUrl ? new URL(def.termsUrl).hostname : ""];
      expect(cited.some((h) => h === host) || host.endsWith("cohere.com"), `${e.modelId} price source ${host}`).toBe(true);
    }
  });

  it("zero prices only where the pricing page lists the model as free; no invented prices for unpriced models", () => {
    for (const e of CATALOGUE) {
      const zero = e.pricing?.inputPerMTokMicros === 0 && e.pricing.outputPerMTokMicros === 0;
      expect(zero, e.modelId).toBe(Boolean(e.zeroPriced));
    }
    // Research gives no price for these: they stay unknown.
    for (const id of ["glm-5.2", "glm-5.3-flashx", "qwen3.7-flash", "qwen3.7-max"]) expect(CATALOGUE.find((e) => e.modelId === id)!.pricing, id).toBeUndefined();
  });

  it("static catalogues exist exactly for the providers without a documented list endpoint", () => {
    const staticProviders = PROVIDERS.filter((p) => p.discovery === "static-catalogue").map((p) => p.id);
    expect(staticProviders).toEqual(["zai", "dashscope"]);
    for (const id of staticProviders) expect(staticModels(id).length, id).toBeGreaterThan(0);
    expect(staticModels("openai")).toEqual([]);
  });

  it("catalogue ids match dated snapshots", () => {
    expect(catalogueKey("claude-opus-5-5-20260801")).toBe("claude-opus-5-5");
    expect(catalogueKey("mistral-small-latest")).toBe("mistral-small");
    expect(catalogueKey("gpt-4o-mini")).toBe("gpt-4o-mini");
  });
});

describe("registry invariants", () => {
  it("coding-plan-restricted providers require a pay-as-you-go attestation and show the warning", () => {
    for (const id of ["zai", "moonshot", "minimax", "dashscope"]) {
      const d = getProviderDef(id)!;
      expect(d.requiresPlanAttestation, id).toBe(true);
      expect(d.planWarning, id).toMatch(/pay-as-you-go/);
    }
  });

  it("every provider records a free-tier type and a privacy note; GitHub Models is recorded as retired, not registered", () => {
    for (const p of PROVIDERS) {
      expect(p.freeTier.note.length, p.id).toBeGreaterThan(3);
      expect(p.privacy.note.length, p.id).toBeGreaterThan(3);
    }
    expect(RETIRED_NOT_ADDED.map((r) => r.id)).toEqual(["github-models"]);
  });

  it("connection fields are validated by anchored patterns; unknown keys and custom endpoints are refused", () => {
    const ds = getProviderDef("dashscope")!;
    expect(validateSettings(ds, { region: "ap-southeast-1", workspaceId: " ws-1 " })).toEqual({ region: "ap-southeast-1", workspaceId: "ws-1" });
    expect(() => validateSettings(ds, { region: "ap-southeast-1", workspaceId: "ws.evil.com" })).toThrowError(expect.objectContaining({ code: "AI_SETTINGS_INVALID" }));
    expect(() => validateSettings(ds, { region: "ap-southeast-1\nx", workspaceId: "w" })).toThrowError(expect.objectContaining({ code: "AI_SETTINGS_INVALID" }));
    expect(() => validateSettings(getProviderDef("openai")!, { proxy: "x" })).toThrowError(expect.objectContaining({ code: "AI_SETTINGS_INVALID" }));
    expect(() => validateSettings(getProviderDef("openai")!, { baseUrl: "https://x" })).toThrowError(expect.objectContaining({ code: "AI_CUSTOM_ENDPOINT_NOT_APPROVED" }));
    for (const p of PROVIDERS) for (const f of p.connectionFields ?? []) expect(f.pattern, `${p.id}.${f.key}`).toMatch(/^\^.*\$$/);
  });

  it("the protocol follows the connection's choice among the provider's protocols, else the documented default", () => {
    expect(protocolFor(getProviderDef("openai")!)).toBe("openai-chat");
    expect(protocolFor(getProviderDef("openai")!, { protocol: "openai-responses" })).toBe("openai-responses");
    expect(protocolFor(getProviderDef("xai")!)).toBe("openai-responses"); // Chat Completions is legacy at xAI
    expect(protocolFor(getProviderDef("anthropic")!, { protocol: "openai-chat" })).toBe("anthropic-messages"); // never the test-only compat layer
    expect(protocolFor(getProviderDef("gemini")!)).toBe("gemini");
    expect(protocolFor(getProviderDef("cohere")!)).toBe("cohere-v2");
  });
});

describe("routing rules", () => {
  const route = (provider: string, caps = UNKNOWN_CAPABILITIES): ResolvedRoute => ({ kind: "workspace", provider, connectionId: "c", connectionLabel: "c", modelId: "m", protocol: "openai-chat", source: "node", capabilities: caps, pricing: null });

  it("never falls back after auth refusals, revocation, safety refusals, cancellation, budget or invalid requests", () => {
    for (const code of ["AI_AUTH_FAILED", "AI_FORBIDDEN", "AI_ROUTE_FORBIDDEN", "AI_CONNECTION_REVOKED", "AI_SAFETY_REFUSAL", "AI_CANCELLED", "BUDGET_EXCEEDED", "AI_BAD_REQUEST", "AI_PLAN_NOT_ALLOWED", "AI_PRIVACY_POLICY"]) expect(mayFallback(code), code).toBe(false);
    for (const code of ["AI_RATE_LIMITED", "AI_PROVIDER_ERROR", "AI_TIMEOUT", "AI_OVERLOADED", "AI_STREAM_INTERRUPTED", "AI_MODEL_REMOVED", "AI_QUOTA_EXCEEDED", "AI_CIRCUIT_OPEN"]) expect(mayFallback(code), code).toBe(true);
    expect([...FALLBACK_ELIGIBLE].filter((c) => FALLBACK_NEVER.has(c))).toEqual([]);
  });

  it("privacy policy: only providers that document no training on API data; gateways can't guarantee upstream terms", () => {
    const policy = { mode: "MANUAL" as const, allowUnknownCost: false, requireNoTraining: true };
    expect(privacyAllows(policy, route("anthropic"))).toBeNull();
    expect(privacyAllows(policy, route("openrouter"))).toMatch(/depends/);
    expect(privacyAllows(policy, route("moonshot"))).toMatch(/yes/);
    expect(privacyAllows(policy, route("xai"))).toMatch(/unknown/);
    expect(privacyAllows({ ...policy, requireNoTraining: false }, route("openrouter"))).toBeNull();
  });

  it("capability checks are tri-state: only UNSUPPORTED is a hard no", () => {
    const req = { system: "", messages: [], maxTokens: 5, tools: [{ name: "t", description: "", parameters: {} }] };
    expect(capabilityProblem(route("x"), req, false)).toBeNull();
    expect(capabilityProblem(route("x", { ...UNKNOWN_CAPABILITIES, tools: "UNSUPPORTED" }), req, false)).toMatch(/tool/);
    expect(capabilityProblem(route("x", { ...UNKNOWN_CAPABILITIES, streaming: "UNSUPPORTED" }), { ...req, tools: [] }, true)).toMatch(/stream/);
  });
});
