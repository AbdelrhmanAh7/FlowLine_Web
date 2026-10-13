import type { AiModelPricing, PriceEntry, PriceTable } from "@/db/schema";
import { priceFor } from "@/server/prices";
import type { HubChatRequest, NormalisedUsage } from "./types";

/**
 * Pricing math for the hub. `PriceSnapshot` is a resolved price: per-million-token prices in micros (millionths of
 * the price's currency unit) plus an optional flat per-call price, tagged with where it came from. Rules:
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

/**
 * A usable price value: a finite, non-negative number (a malformed stored value is UNKNOWN, never 0).
 * @param n Any stored value, e.g. a price in micros per million tokens.
 * @returns True (and narrows `n` to `number`) when it is a finite number >= 0.
 */
export function validPrice(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * Converts a workspace price-table entry into a snapshot with source `workspace_price_table`.
 * @param p The owner-entered entry (micros per million tokens, workspace currency); may be undefined.
 * @returns The snapshot, or null when the entry is missing or its input or output price is not a valid price.
 */
export function fromPriceEntry(p: PriceEntry | undefined): PriceSnapshot | null {
  if (!p || !validPrice(p.inputPerMTokMicros) || !validPrice(p.outputPerMTokMicros)) return null;
  return { inputPerMTokMicros: p.inputPerMTokMicros, outputPerMTokMicros: p.outputPerMTokMicros, perCallMicros: p.perCallMicros, source: "workspace_price_table" };
}

/**
 * Resolves the price of a model: the workspace price table first, then the public catalogue, else unknown.
 * @param prices The workspace price table, looked up under the key `ai:<provider>/<modelId>`.
 * @param provider Provider id, part of the price-table key.
 * @param modelId Model id, part of the price-table key.
 * @param catalogue The catalogue pricing (`ai_model.pricing`) for the model, if any.
 * @param ctx The workspace `currency` and the connection's `region`; a catalogue price with a different currency or region is not used.
 * @returns A snapshot (source `workspace_price_table` or `catalogue`), or null when the price is unknown.
 */
export function resolvePrice(
  prices: PriceTable,
  provider: string,
  modelId: string,
  catalogue: AiModelPricing | null | undefined,
  ctx: { currency?: string; region?: string | null } = {},
): PriceSnapshot | null {
  const own = fromPriceEntry(priceFor(prices ?? {}, `ai:${provider}/${modelId}`));
  if (own) return own;
  if (!catalogue || !validPrice(catalogue.inputPerMTokMicros) || !validPrice(catalogue.outputPerMTokMicros)) return null;
  if (catalogue.currency && ctx.currency && catalogue.currency !== ctx.currency) return null;
  if (catalogue.region && catalogue.region !== (ctx.region ?? null)) return null;
  return { ...catalogue, source: "catalogue" };
}

/**
 * Checks whether a catalogue snapshot has zero input/output prices and no per-call or positive cache-write charge.
 * @param p The resolved price, or null when unknown.
 * @returns True only for a catalogue price with zero input and output prices, no per-call price and no positive cache-write price.
 */
export function isVerifiedZeroPrice(p: PriceSnapshot | null): boolean {
  return Boolean(
    p &&
      p.source === "catalogue" &&
      validPrice(p.inputPerMTokMicros) &&
      validPrice(p.outputPerMTokMicros) &&
      p.inputPerMTokMicros === 0 &&
      p.outputPerMTokMicros === 0 &&
      !p.perCallMicros &&
      !(p.cacheWritePerMTokMicros && p.cacheWritePerMTokMicros > 0),
  );
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

/**
 * Actual cost of an attempt in micros, or null when the price is unknown.
 * Cache reads without their own price (or priced above input) are charged at the input price; reasoning tokens are
 * charged as output; the long-context tier applies above its input-token threshold; the result is rounded to a whole
 * micro before the flat per-call price is added.
 * @param p The resolved price (micros per million tokens), or null when unknown.
 * @param u The attempt's normalised token usage.
 * @returns The cost in micros of the price's currency, or null when the price is unknown (including cache writes without a cache-write price).
 */
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

/** Per-message framing (role markers, separators) the protocols add around every turn, in characters. */
const MESSAGE_FRAMING_CHARS = 16;

/**
 * Every character a protocol request sends as model input (CXH-07): the system prompt, every message — its text,
 * the historical assistant tool calls WITH their arguments, the tool results with their call ids and names — the tool
 * definitions and the output schema, plus per-message framing. Serialised as JSON, so keys and quotes are counted
 * too: a conservative bound, never an optimistic one. The ONE size used for budget reservations, policy ranking
 * (LOW_COST) and agent cost limits.
 * @param req The hub chat request about to be sent to a protocol.
 * @returns The size of the model input, in characters.
 */
export function requestInputChars(req: HubChatRequest): number {
  return (
    req.system.length +
    JSON.stringify(req.messages).length +
    req.messages.length * MESSAGE_FRAMING_CHARS +
    JSON.stringify(req.tools ?? []).length +
    JSON.stringify(req.schema ?? {}).length
  );
}

/**
 * Upper-bound input token count for a prompt, used for budget reservation. ~2 chars/token covers non-Latin
 * scripts (Arabic tokenises much denser than English), so the reservation is defensible, not optimistic.
 * @param chars Prompt size in characters (e.g. from `requestInputChars`).
 * @returns The token upper bound: `ceil(chars / 2) + 16`.
 */
export function maxInputTokens(chars: number) {
  return Math.ceil(chars / 2) + 16;
}

/**
 * Defensible maximum cost of one attempt: every input token uncached + every allowed output token. Null if unknown.
 * Input is priced at the higher of the input and cache-write prices; the result is rounded up to a whole micro and includes the flat per-call price.
 * @param p The resolved price (micros per million tokens), or null when unknown.
 * @param promptChars Prompt size in characters, converted with `maxInputTokens`.
 * @param maxOutputTokens The most output tokens the attempt may produce.
 * @returns The maximum cost in micros of the price's currency, or null when the price is unknown.
 */
export function maxCostMicros(p: PriceSnapshot | null, promptChars: number, maxOutputTokens: number): number | null {
  if (!p || p.inputPerMTokMicros == null || p.outputPerMTokMicros == null) return null;
  const inTok = maxInputTokens(promptChars);
  const t = tier(p, inTok);
  if (!t) return null;
  return Math.ceil(perM(inTok, Math.max(t.input, p.cacheWritePerMTokMicros ?? 0)) + perM(maxOutputTokens, t.output)) + (p.perCallMicros ?? 0);
}
