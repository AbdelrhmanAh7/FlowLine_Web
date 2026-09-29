import type { AiModelCapabilities, AiModelPricing } from "@/db/schema";
import { HubError, type DiscoveredModel } from "../types";
import { validModelId } from "./openai-chat";
import { num } from "./shared";

/**
 * Model-list parsers for providers whose listing is not the OpenAI `{data:[{id}]}` shape. Each follows the shape the
 * research record cites; fields not documented there are not read. Prices are only taken where the listing documents
 * the unit (OpenRouter and Vercel: USD per token as strings) and are converted to micro-USD per million tokens.
 */

function malformed(what: string): never {
  throw new HubError("AI_CATALOGUE_MALFORMED", `The model list is malformed (${what})`);
}

/** A plain non-negative decimal (optionally with an exponent): no blanks, signs, hex, "Infinity" or padding. */
const PRICE_TEXT = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/**
 * "0.000001" USD per token → 1_000_000 micro-USD per million tokens. Only a non-empty, valid numeric representation
 * is a price (CXH-09): "", " ", "abc", "0x0", negative (e.g. OpenRouter's -1 = variable) → unknown, never zero.
 */
export function perTokenUsdToMicrosPerM(v: unknown): number | undefined {
  const n = typeof v === "string" ? (PRICE_TEXT.test(v) ? Number(v) : NaN) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 1e12);
}

/** A price object was supplied (whatever its content): only then can the listing invalidate a known price. */
function supplied(p: unknown): boolean {
  return p != null && typeof p === "object" && Object.keys(p as object).length > 0;
}

function pricing(input: unknown, output: unknown, cacheRead?: unknown, cacheWrite?: unknown, sourceUrl?: string): AiModelPricing | null {
  const i = perTokenUsdToMicrosPerM(input);
  const o = perTokenUsdToMicrosPerM(output);
  if (i == null || o == null) return null;
  const cr = perTokenUsdToMicrosPerM(cacheRead);
  const cw = perTokenUsdToMicrosPerM(cacheWrite);
  return { inputPerMTokMicros: i, outputPerMTokMicros: o, ...(cr != null ? { cacheReadPerMTokMicros: cr } : {}), ...(cw != null ? { cacheWritePerMTokMicros: cw } : {}), currency: "USD", ...(sourceUrl ? { sourceUrl } : {}) };
}

/**
 * OpenRouter GET /api/v1/models (offset/limit, total_count, links.next). Capabilities from `supported_parameters`:
 * "tools" present → tools SUPPORTED, absent (with the array present) → UNSUPPORTED; "structured_outputs" →
 * json_schema SUPPORTED (absent stays UNKNOWN: the model may still follow a prompted schema).
 */
export function parseOpenRouterModels(body: unknown, offset: number): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { data?: unknown; total_count?: unknown; links?: { next?: unknown } };
  if (!d || typeof d !== "object" || !Array.isArray(d.data)) malformed("no data array");
  const models: DiscoveredModel[] = [];
  for (const m of d.data as { id?: unknown; context_length?: unknown; pricing?: { prompt?: unknown; completion?: unknown }; supported_parameters?: unknown; top_provider?: { max_completion_tokens?: unknown }; expiration_date?: unknown }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.id)) malformed("an entry has no valid id");
    const params = Array.isArray(m.supported_parameters) ? (m.supported_parameters as unknown[]) : null;
    const caps: Partial<AiModelCapabilities> = params ? { tools: params.includes("tools") ? "SUPPORTED" : "UNSUPPORTED", ...(params.includes("structured_outputs") ? { structuredOutput: "SUPPORTED" as const } : {}) } : {};
    const price = pricing(m.pricing?.prompt, m.pricing?.completion, undefined, undefined, "https://openrouter.ai/docs/api/api-reference/models/get-models");
    models.push({
      id: m.id,
      ownedBy: m.id.includes("/") ? m.id.split("/")[0]!.slice(0, 120) : null,
      contextWindow: num(m.context_length),
      maxOutputTokens: num(m.top_provider?.max_completion_tokens),
      capabilities: caps,
      pricing: price,
      pricingInvalid: !price && supplied(m.pricing),
      deprecated: typeof m.expiration_date === "string" && m.expiration_date !== "" && Date.parse(m.expiration_date) < Date.now(),
    });
  }
  const total = num(d.total_count);
  const end = offset + models.length;
  const more = models.length > 0 && (total != null ? end < total : typeof d.links?.next === "string" && d.links.next !== "");
  return { models: models.filter((m) => !m.deprecated), next: more ? String(end) : null };
}

/** Vercel AI Gateway GET /v1/models (public; context_window, max_tokens, tags, pricing per token). */
export function parseVercelModels(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { data?: unknown };
  if (!d || typeof d !== "object" || !Array.isArray(d.data)) malformed("no data array");
  const models: DiscoveredModel[] = [];
  for (const m of d.data as { id?: unknown; context_window?: unknown; max_tokens?: unknown; tags?: unknown; pricing?: { input?: unknown; output?: unknown; input_cache_read?: unknown; input_cache_write?: unknown } }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.id)) malformed("an entry has no valid id");
    const tags = Array.isArray(m.tags) ? (m.tags as unknown[]) : [];
    const price = pricing(m.pricing?.input, m.pricing?.output, m.pricing?.input_cache_read, m.pricing?.input_cache_write, "https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api");
    models.push({
      id: m.id,
      ownedBy: m.id.includes("/") ? m.id.split("/")[0]!.slice(0, 120) : null,
      contextWindow: num(m.context_window),
      maxOutputTokens: num(m.max_tokens),
      capabilities: { ...(tags.includes("tool-use") ? { tools: "SUPPORTED" as const } : {}), ...(tags.includes("reasoning") ? { reasoning: "SUPPORTED" as const } : {}), ...(tags.includes("vision") ? { vision: "SUPPORTED" as const } : {}) },
      pricing: price,
      pricingInvalid: !price && supplied(m.pricing),
    });
  }
  return { models, next: null };
}

/**
 * DeepInfra GET /models/list (public array: model_name, type, pricing, max_tokens, deprecated, private). The pricing
 * unit and the `type` values are not documented in the research → prices stay unknown and nothing is filtered by type.
 */
export function parseDeepInfraModels(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  if (!Array.isArray(body)) malformed("not an array");
  const models: DiscoveredModel[] = [];
  for (const m of body as { model_name?: unknown; max_tokens?: unknown; deprecated?: unknown; private?: unknown }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.model_name)) malformed("an entry has no valid model_name");
    if (m.deprecated === true || (typeof m.deprecated === "number" && m.deprecated > 0) || m.private === true) continue;
    models.push({ id: m.model_name, ownedBy: m.model_name.includes("/") ? m.model_name.split("/")[0]!.slice(0, 120) : null, contextWindow: num(m.max_tokens) });
  }
  return { models, next: null };
}

/** Fireworks GET /v1/accounts/fireworks/models (pageSize ≤ 200, pageToken; name, contextLength, supportsTools, supportsImageInput). */
export function parseFireworksModels(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { models?: unknown; nextPageToken?: unknown };
  if (!d || typeof d !== "object" || !Array.isArray(d.models)) malformed("no models array");
  const models: DiscoveredModel[] = [];
  for (const m of d.models as { name?: unknown; contextLength?: unknown; supportsTools?: unknown; supportsImageInput?: unknown }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.name)) malformed("an entry has no valid name");
    models.push({
      id: m.name,
      ownedBy: "fireworks",
      contextWindow: num(m.contextLength),
      capabilities: { ...(typeof m.supportsTools === "boolean" ? { tools: m.supportsTools ? ("SUPPORTED" as const) : ("UNSUPPORTED" as const) } : {}), ...(typeof m.supportsImageInput === "boolean" ? { vision: m.supportsImageInput ? ("SUPPORTED" as const) : ("UNSUPPORTED" as const) } : {}) },
    });
  }
  return { models, next: typeof d.nextPageToken === "string" && d.nextPageToken ? d.nextPageToken : null };
}

/** Cloudflare GET …/ai/models/search (page/per_page; envelope {result, success}). Model ids read from result[].name. */
export function parseCloudflareModels(body: unknown, page: number, perPage: number): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { result?: unknown; success?: unknown };
  if (!d || typeof d !== "object" || d.success === false || !Array.isArray(d.result)) malformed("no result array");
  const models: DiscoveredModel[] = [];
  for (const m of d.result as { name?: unknown }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.name)) malformed("an entry has no valid name");
    models.push({ id: m.name, ownedBy: "cloudflare" });
  }
  return { models, next: models.length >= perPage ? String(page + 1) : null };
}
