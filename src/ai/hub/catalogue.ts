import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AiModelCapabilities, AiModelPricing } from "@/db/schema";
import { getProviderDef, protocolFor, type ProviderDefinition } from "./registry";
import { UNKNOWN_CAPABILITIES, type DiscoveredModel } from "./types";

/**
 * Curated, VERSIONED public catalogue. Every price comes from an official pricing page cited in the research record
 * (artifacts/ai-hub/research/providers-2026-09-29.md) with its URL and check date; nothing is estimated or copied from
 * third parties. A model or price that the research doesn't give stays UNKNOWN (absent), never 0.
 *
 * `idSource`: "documented" = the API model id appears verbatim in the source; "display-name" = derived from the
 * pricing page's display name (the id must be confirmed by a live listing/call — the UI says so).
 * Static lists (Z.ai, Alibaba Model Studio) are the discovery source for providers without a documented list endpoint.
 * Units: micro-USD per million tokens ($1 / 1M tokens = 1_000_000).
 */
export const CATALOGUE_VERSION = 1;
export const CATALOGUE_DATE = "2026-09-29";

export interface CatalogueEntry {
  provider: string;
  modelId: string;
  displayName: string;
  idSource: "documented" | "display-name";
  pricing?: AiModelPricing;
  capabilities?: Partial<AiModelCapabilities>;
  contextWindow?: number;
  /** Verified zero price on the official pricing page (FREE_ONLY may use it). */
  zeroPriced?: boolean;
  freeTierNote?: string;
  /** Part of the provider's static discovery list. */
  static?: boolean;
}

const $ = (usdPerM: number) => Math.round(usdPerM * 1_000_000);
const price = (url: string, p: Omit<AiModelPricing, "currency" | "sourceUrl" | "verifiedAt">): AiModelPricing => ({ ...p, currency: "USD", sourceUrl: url, verifiedAt: CATALOGUE_DATE });

const OPENAI = "https://developers.openai.com/api/docs/pricing";
const ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing";
const GEMINI = "https://ai.google.dev/gemini-api/docs/pricing";
const XAI = "https://docs.x.ai/developers/pricing";
const GROQ = "https://console.groq.com/docs/models";
const DEEPSEEK = "https://api-docs.deepseek.com/quick_start/pricing";
const ZAI = "https://docs.z.ai/guides/overview/pricing";
const KIMI = "https://platform.kimi.ai/docs/pricing/chat.md";
const MINIMAX = "https://platform.minimax.io/docs/guides/pricing-paygo.md";
const ALIBABA = "https://www.alibabacloud.com/help/en/model-studio/model-pricing";
const COHERE = "https://cohere.com/pricing";

const zaiTools: Partial<AiModelCapabilities> = { tools: "SUPPORTED", structuredOutput: "UNSUPPORTED" };
const qwenJson: Partial<AiModelCapabilities> = { tools: "SUPPORTED", structuredOutput: "SUPPORTED" };

export const CATALOGUE: CatalogueEntry[] = [
  { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o mini", idSource: "documented", pricing: price(OPENAI, { inputPerMTokMicros: $(0.15), cacheReadPerMTokMicros: $(0.075), outputPerMTokMicros: $(0.6) }) },

  // Cache reads 0.1× input (0.05× on Opus 5.5). Cache-write prices aren't in the research (Flowline never requests caching).
  { provider: "anthropic", modelId: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", idSource: "display-name", pricing: price(ANTHROPIC, { inputPerMTokMicros: $(1), cacheReadPerMTokMicros: $(0.1), outputPerMTokMicros: $(5) }) },
  { provider: "anthropic", modelId: "claude-sonnet-5-5", displayName: "Claude Sonnet 5.5", idSource: "display-name", pricing: price(ANTHROPIC, { inputPerMTokMicros: $(2), cacheReadPerMTokMicros: $(0.2), outputPerMTokMicros: $(10) }) },
  { provider: "anthropic", modelId: "claude-opus-5-5", displayName: "Claude Opus 5.5", idSource: "documented", pricing: price(ANTHROPIC, { inputPerMTokMicros: $(4), cacheReadPerMTokMicros: $(0.2), outputPerMTokMicros: $(20) }) },

  // Paid-tier price. The free tier (free of charge with quota, data used for training) can't be confirmed per key.
  { provider: "gemini", modelId: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash", idSource: "display-name", pricing: price(GEMINI, { inputPerMTokMicros: $(1.5), outputPerMTokMicros: $(9) }), freeTierNote: "Free of charge on the Free tier (quota-limited; content used to improve Google products). Flowline can't confirm a key is on the free tier, so the paid price is used." },

  { provider: "xai", modelId: "grok-4.7", displayName: "Grok 4.7", idSource: "documented", pricing: price(XAI, { inputPerMTokMicros: $(2), cacheReadPerMTokMicros: $(0.5), outputPerMTokMicros: $(6) }) },

  { provider: "groq", modelId: "openai/gpt-oss-120b", displayName: "GPT OSS 120B", idSource: "display-name", pricing: price(GROQ, { inputPerMTokMicros: $(0.15), outputPerMTokMicros: $(0.6) }) },

  // PEAK prices (off-peak is half): estimates are an upper bound during off-peak hours.
  { provider: "deepseek", modelId: "deepseek-flash", displayName: "DeepSeek V4.1 Flash", idSource: "documented", pricing: price(DEEPSEEK, { inputPerMTokMicros: $(0.3), cacheReadPerMTokMicros: $(0.006), outputPerMTokMicros: $(1.2) }), capabilities: { tools: "SUPPORTED", structuredOutput: "UNSUPPORTED" } },
  { provider: "deepseek", modelId: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro", idSource: "documented", pricing: price(DEEPSEEK, { inputPerMTokMicros: $(1.32), cacheReadPerMTokMicros: $(0.044), outputPerMTokMicros: $(3.96) }), capabilities: { tools: "SUPPORTED", structuredOutput: "UNSUPPORTED" } },

  // Z.ai: no list endpoint → this static list IS the discovery source. Ids lower-cased from the pricing page names.
  { provider: "zai", modelId: "glm-5.3", displayName: "GLM-5.3", idSource: "display-name", static: true, capabilities: zaiTools, pricing: price(ZAI, { inputPerMTokMicros: $(1.4), cacheReadPerMTokMicros: $(0.26), outputPerMTokMicros: $(4.4) }) },
  { provider: "zai", modelId: "glm-5.3-flash", displayName: "GLM-5.3-Flash", idSource: "display-name", static: true, capabilities: zaiTools, pricing: price(ZAI, { inputPerMTokMicros: $(0.15), cacheReadPerMTokMicros: $(0.03), outputPerMTokMicros: $(0.5) }) },
  { provider: "zai", modelId: "glm-5.3-flashx", displayName: "GLM-5.3-FlashX", idSource: "display-name", static: true, capabilities: zaiTools },
  { provider: "zai", modelId: "glm-5.2", displayName: "GLM-5.2", idSource: "display-name", static: true, capabilities: zaiTools },
  { provider: "zai", modelId: "glm-4.7-flash", displayName: "GLM-4.7-Flash", idSource: "display-name", static: true, capabilities: zaiTools, zeroPriced: true, pricing: price(ZAI, { inputPerMTokMicros: 0, outputPerMTokMicros: 0 }), freeTierNote: "Listed as \"Free\"; quota and durability are not stated." },
  { provider: "zai", modelId: "glm-4.5-flash", displayName: "GLM-4.5-Flash", idSource: "display-name", static: true, capabilities: zaiTools, zeroPriced: true, pricing: price(ZAI, { inputPerMTokMicros: 0, outputPerMTokMicros: 0 }), freeTierNote: "Listed as \"Free\"; quota and durability are not stated." },
  { provider: "zai", modelId: "glm-4.6v-flash", displayName: "GLM-4.6V-Flash", idSource: "display-name", static: true, capabilities: zaiTools, zeroPriced: true, pricing: price(ZAI, { inputPerMTokMicros: 0, outputPerMTokMicros: 0 }), freeTierNote: "Listed as \"Free\"; quota and durability are not stated." },

  // Kimi: json_object + json_schema and tools are documented API-wide.
  { provider: "moonshot", modelId: "kimi-k3", displayName: "Kimi K3", idSource: "documented", contextWindow: 1_000_000, capabilities: { tools: "SUPPORTED", structuredOutput: "SUPPORTED" }, pricing: price(KIMI, { inputPerMTokMicros: $(3), cacheReadPerMTokMicros: $(0.3), cacheWritePerMTokMicros: $(3), outputPerMTokMicros: $(15) }) },
  { provider: "moonshot", modelId: "kimi-k2.6", displayName: "Kimi K2.6", idSource: "documented", capabilities: { tools: "SUPPORTED", structuredOutput: "SUPPORTED" }, pricing: price(KIMI, { inputPerMTokMicros: $(0.95), cacheReadPerMTokMicros: $(0.16), outputPerMTokMicros: $(4) }) },

  // Contexts over 512k tokens are billed at double rates.
  { provider: "minimax", modelId: "MiniMax-M3", displayName: "MiniMax-M3", idSource: "documented", capabilities: { tools: "SUPPORTED", structuredOutput: "UNSUPPORTED" }, pricing: price(MINIMAX, { inputPerMTokMicros: $(0.3), outputPerMTokMicros: $(1.2), longContext: { aboveInputTokens: 512_000, inputPerMTokMicros: $(0.6), outputPerMTokMicros: $(2.4) } }) },

  // Alibaba Model Studio: no documented list endpoint → static list. Prices are Singapore (ap-southeast-1) prices.
  { provider: "dashscope", modelId: "qwen3.8-flash", displayName: "Qwen3.8-Flash", idSource: "display-name", static: true, capabilities: qwenJson, pricing: price(ALIBABA, { inputPerMTokMicros: $(0.15), outputPerMTokMicros: $(0.47), region: "ap-southeast-1" }) },
  { provider: "dashscope", modelId: "qwen3.8-max", displayName: "Qwen3.8-Max", idSource: "display-name", static: true, capabilities: qwenJson, pricing: price(ALIBABA, { inputPerMTokMicros: $(2), outputPerMTokMicros: $(6), region: "ap-southeast-1" }) },
  // Price valid up to 256K input tokens; the higher tier isn't in the research, so longer prompts are unpriced.
  { provider: "dashscope", modelId: "qwen3.7-plus", displayName: "Qwen3.7-Plus", idSource: "display-name", static: true, capabilities: qwenJson, pricing: price(ALIBABA, { inputPerMTokMicros: $(0.4), outputPerMTokMicros: $(1.6), region: "ap-southeast-1", longContext: { aboveInputTokens: 256_000, inputPerMTokMicros: -1, outputPerMTokMicros: -1 } }) },
  { provider: "dashscope", modelId: "qwen3.7-flash", displayName: "Qwen3.7-Flash", idSource: "display-name", static: true, capabilities: qwenJson },
  { provider: "dashscope", modelId: "qwen3.7-max", displayName: "Qwen3.7-Max", idSource: "display-name", static: true, capabilities: qwenJson },

  // Only legacy examples rendered on the Cohere pricing page (current Command A prices: UNKNOWN).
  { provider: "cohere", modelId: "command-r-plus-08-2024", displayName: "Command R+ 08-2024", idSource: "display-name", pricing: price(COHERE, { inputPerMTokMicros: $(2.5), outputPerMTokMicros: $(10) }) },
];

/** Catalogue ids are matched exactly, or with a trailing date / "-latest" stripped (e.g. claude-opus-5-5-20260801). */
export function catalogueKey(modelId: string) {
  return modelId.replace(/-(\d{8}|latest)$/, "");
}

export function staticModels(providerId: string): DiscoveredModel[] {
  return CATALOGUE.filter((e) => e.provider === providerId && e.static).map((e) => ({ id: e.modelId, ownedBy: providerId, contextWindow: e.contextWindow ?? null, capabilities: e.capabilities, pricing: e.pricing ?? null }));
}

function caps(def: ProviderDefinition, ...layers: (Partial<AiModelCapabilities> | undefined)[]): AiModelCapabilities {
  // Provider-wide documented UNSUPPORTED facts win over anything else.
  return Object.assign({}, UNKNOWN_CAPABILITIES, ...layers.filter(Boolean), def.capabilityFloor ?? {});
}

/** Upserts the curated entries of one provider into ai_model (idempotent; bumps nothing when unchanged). */
export async function syncCurated(db: Db, providerId: string) {
  const def = getProviderDef(providerId);
  if (!def || !def.protocols.length) return;
  const rows = CATALOGUE.filter((e) => e.provider === providerId);
  for (const e of rows) {
    const values = {
      provider: providerId,
      modelId: e.modelId,
      displayName: e.displayName,
      author: providerId,
      protocol: protocolFor(def),
      capabilities: caps(def, e.capabilities),
      contextWindow: e.contextWindow ?? null,
      pricing: e.pricing ?? null,
      priceSource: e.pricing?.sourceUrl ?? null,
      priceVerifiedAt: e.pricing ? new Date(`${CATALOGUE_DATE}T00:00:00Z`) : null,
      freeTierNote: e.freeTierNote ?? (e.zeroPriced ? "Verified zero price on the official pricing page." : null),
      privacyNote: def.privacy.note,
      source: `curated:${CATALOGUE_DATE}:${e.idSource}`,
      snapshotVersion: CATALOGUE_VERSION,
      lifecycle: "active",
      stale: false,
      updatedAt: new Date(),
    };
    await db
      .insert(schema.aiModel)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.aiModel.provider, schema.aiModel.modelId],
        set: { ...values },
        // Never overwrite a newer snapshot with an older catalogue version.
        setWhere: sql`${schema.aiModel.snapshotVersion} <= ${CATALOGUE_VERSION}`,
      });
  }
}

/**
 * Listing metadata → ai_model, ONLY for providers whose listing is their public catalogue (not per-credential), so
 * one tenant's private/fine-tuned model names never reach another tenant. Listing prices (OpenRouter, Vercel)
 * replace curated ones; a listing without prices never clears a curated price.
 */
export async function storeListingMetadata(db: Db, def: ProviderDefinition, models: DiscoveredModel[]) {
  if (!def.listingIsPublic) return;
  const curated = new Map(CATALOGUE.filter((e) => e.provider === def.id).map((e) => [e.modelId, e]));
  const now = new Date();
  const prior = new Map(
    (await db.select({ modelId: schema.aiModel.modelId, pricing: schema.aiModel.pricing, priceSource: schema.aiModel.priceSource }).from(schema.aiModel).where(eq(schema.aiModel.provider, def.id))).map((r) => [r.modelId, r]),
  );
  for (const m of models.slice(0, 2000)) {
    const cur = curated.get(catalogueKey(m.id));
    const existing = prior.get(m.id);
    const listingPrice = m.pricing && m.pricing.inputPerMTokMicros != null ? { ...m.pricing, verifiedAt: now.toISOString().slice(0, 10) } : null;
    const pricing = listingPrice ?? existing?.pricing ?? cur?.pricing ?? null;
    const zero = Boolean(listingPrice && listingPrice.inputPerMTokMicros === 0 && listingPrice.outputPerMTokMicros === 0);
    const values = {
      provider: def.id,
      modelId: m.id,
      displayName: cur?.displayName ?? null,
      author: m.ownedBy,
      servingProvider: def.routeKind === "gateway" ? null : def.id,
      protocol: protocolFor(def),
      capabilities: caps(def, cur?.capabilities, m.capabilities),
      contextWindow: m.contextWindow ?? cur?.contextWindow ?? null,
      maxOutputTokens: m.maxOutputTokens ?? null,
      pricing,
      priceSource: listingPrice ? (listingPrice.sourceUrl ?? `${def.name} model list`) : (existing?.priceSource ?? cur?.pricing?.sourceUrl ?? null),
      priceVerifiedAt: listingPrice ? now : cur?.pricing ? new Date(`${CATALOGUE_DATE}T00:00:00Z`) : null,
      freeTierNote: zero ? `Zero-priced in ${def.name}'s model list (${def.freeTier.note})` : (cur?.freeTierNote ?? null),
      privacyNote: def.privacy.note,
      source: `listing:${def.discovery}`,
      snapshotVersion: CATALOGUE_VERSION,
      lifecycle: "active",
      stale: false,
      updatedAt: now,
    };
    await db.insert(schema.aiModel).values(values).onConflictDoUpdate({ target: [schema.aiModel.provider, schema.aiModel.modelId], set: values });
  }
}
