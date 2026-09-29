import type { AiModelPricing, PriceEntry, PriceTable } from "@/db/schema";
import { priceFor } from "@/server/prices";
import type { NormalisedUsage } from "./types";

/**
 * Pricing math for the hub. Rules:
 * - A price is either KNOWN (input AND output per-token prices present) or UNKNOWN. Unknown is never treated as 0.
 * - Sources, in order: the workspace's own price table (`ai:<provider>/<model>`, owner-entered, in the workspace
 *   currency) → the public catalogue (ai_model.pricing: official pricing page or documented listing, with its
 *   verification date) → unknown. A catalogue price in another currency than the workspace's, or for another region
 *   than the connection's, is UNKNOWN (never converted or reused).
 * - Cached input reads without their own price are charged at the input price (conservative: reads are cheaper).
 *   Cache WRITES without their own price make the cost unknown (writes can cost more than input).
 * - Reasoning tokens are output. Long-context tiers switch to the higher price above their threshold.
 */
export type PriceSnapshot = AiModelPricing & { perCallMicros?: number; source: "workspace_price_table" | "catalogue" };

export function fromPriceEntry(p: PriceEntry | undefined): PriceSnapshot | null {
  if (!p || p.inputPerMTokMicros == null || p.outputPerMTokMicros == null) return null;
  return { inputPerMTokMicros: p.inputPerMTokMicros, outputPerMTokMicros: p.outputPerMTokMicros, perCallMicros: p.perCallMicros, source: "workspace_price_table" };
}

export function resolvePrice(
  prices: PriceTable,
  provider: string,
  modelId: string,
  catalogue: AiModelPricing | null | undefined,
  ctx: { currency?: string; region?: string | null } = {},
): PriceSnapshot | null {
  const own = fromPriceEntry(priceFor(prices ?? {}, `ai:${provider}/${modelId}`));
  if (own) return own;
  if (!catalogue || catalogue.inputPerMTokMicros == null || catalogue.outputPerMTokMicros == null) return null;
  if (catalogue.currency && ctx.currency && catalogue.currency !== ctx.currency) return null;
  if (catalogue.region && catalogue.region !== (ctx.region ?? null)) return null;
  return { ...catalogue, source: "catalogue" };
}

/** A route is FREE only when its price is known, verified (catalogue: official page or documented listing) and zero. */
export function isVerifiedZeroPrice(p: PriceSnapshot | null): boolean {
  return Boolean(p && p.source === "catalogue" && p.inputPerMTokMicros === 0 && p.outputPerMTokMicros === 0 && !p.perCallMicros && !(p.cacheWritePerMTokMicros && p.cacheWritePerMTokMicros > 0));
}

const perM = (tokens: number, microsPerM: number) => (tokens * microsPerM) / 1_000_000;

/** The (input, output) prices that apply for a request with `inputTokens` input tokens; null when that tier is unpriced. */
function tier(p: PriceSnapshot, inputTokens: number): { input: number; output: number } | null {
  const lc = p.longContext;
  if (lc && inputTokens > lc.aboveInputTokens) {
    if (!(lc.inputPerMTokMicros >= 0) || !(lc.outputPerMTokMicros >= 0)) return null;
    return { input: lc.inputPerMTokMicros, output: lc.outputPerMTokMicros };
  }
  return { input: p.inputPerMTokMicros!, output: p.outputPerMTokMicros! };
}

/** Actual cost of an attempt in micros, or null when the price is unknown. */
export function costMicros(p: PriceSnapshot | null, u: NormalisedUsage): number | null {
  if (!p || p.inputPerMTokMicros == null || p.outputPerMTokMicros == null) return null;
  if ((u.cacheWriteTokens ?? 0) > 0 && p.cacheWritePerMTokMicros == null) return null;
  const t = tier(p, u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0));
  if (!t) return null;
  const input = perM(u.inputTokens, t.input);
  const cacheRead = perM(u.cacheReadTokens ?? 0, Math.min(p.cacheReadPerMTokMicros ?? t.input, t.input));
  const cacheWrite = perM(u.cacheWriteTokens ?? 0, p.cacheWritePerMTokMicros ?? 0);
  const output = perM(u.outputTokens + (u.reasoningTokens ?? 0), t.output);
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
  const inTok = maxInputTokens(promptChars);
  const t = tier(p, inTok);
  if (!t) return null;
  return Math.ceil(perM(inTok, Math.max(t.input, p.cacheWritePerMTokMicros ?? 0)) + perM(maxOutputTokens, t.output)) + (p.perCallMicros ?? 0);
}
