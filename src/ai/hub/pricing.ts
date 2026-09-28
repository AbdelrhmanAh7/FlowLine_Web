import type { AiModelPricing, PriceEntry, PriceTable } from "@/db/schema";
import { priceFor } from "@/server/prices";
import type { NormalisedUsage } from "./types";

/**
 * Pricing math for the hub. Rules:
 * - A price is either KNOWN (input AND output per-token prices present) or UNKNOWN. Unknown is never treated as 0.
 * - Sources, in order: the workspace's own price table (`ai:<provider>/<model>`, owner-entered) → the public
 *   catalogue (ai_model.pricing, with its verification date) → unknown.
 * - Cached input without its own price is charged at the input price (conservative); reasoning tokens are output.
 */
export type PriceSnapshot = AiModelPricing & { perCallMicros?: number; source: "workspace_price_table" | "catalogue" };

export function fromPriceEntry(p: PriceEntry | undefined): PriceSnapshot | null {
  if (!p || p.inputPerMTokMicros == null || p.outputPerMTokMicros == null) return null;
  return { inputPerMTokMicros: p.inputPerMTokMicros, outputPerMTokMicros: p.outputPerMTokMicros, perCallMicros: p.perCallMicros, source: "workspace_price_table" };
}

export function resolvePrice(prices: PriceTable, provider: string, modelId: string, catalogue: AiModelPricing | null | undefined): PriceSnapshot | null {
  const own = fromPriceEntry(priceFor(prices ?? {}, `ai:${provider}/${modelId}`));
  if (own) return own;
  if (catalogue && catalogue.inputPerMTokMicros != null && catalogue.outputPerMTokMicros != null) return { ...catalogue, source: "catalogue" };
  return null;
}

const perM = (tokens: number, microsPerM: number) => (tokens * microsPerM) / 1_000_000;

/** Actual cost of an attempt in micros, or null when the price is unknown. */
export function costMicros(p: PriceSnapshot | null, u: NormalisedUsage): number | null {
  if (!p || p.inputPerMTokMicros == null || p.outputPerMTokMicros == null) return null;
  const input = perM(u.inputTokens, p.inputPerMTokMicros);
  const cacheRead = perM(u.cacheReadTokens ?? 0, p.cacheReadPerMTokMicros ?? p.inputPerMTokMicros);
  const cacheWrite = perM(u.cacheWriteTokens ?? 0, p.cacheWritePerMTokMicros ?? p.inputPerMTokMicros);
  const output = perM(u.outputTokens + (u.reasoningTokens ?? 0), p.outputPerMTokMicros);
  return Math.round(input + cacheRead + cacheWrite + output) + (p.perCallMicros ?? 0);
}

/**
 * Upper-bound input token count for a prompt, used for budget reservation. ~2 chars/token covers non-Latin
 * scripts (Arabic tokenises much denser than English), so the reservation is defensible, not optimistic.
 */
export function maxInputTokens(chars: number) {
  return Math.ceil(chars / 2) + 16;
}

/** Defensible maximum cost of one attempt: every input token uncached + every allowed output token. Null if unknown. */
export function maxCostMicros(p: PriceSnapshot | null, promptChars: number, maxOutputTokens: number): number | null {
  if (!p || p.inputPerMTokMicros == null || p.outputPerMTokMicros == null) return null;
  return Math.ceil(perM(maxInputTokens(promptChars), p.inputPerMTokMicros) + perM(maxOutputTokens, p.outputPerMTokMicros)) + (p.perCallMicros ?? 0);
}
