import type { SafeResponse } from "@/server/egress";
import type { ProviderDefinition } from "../registry";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type HubToolCall, type NormalisedResult } from "../types";
import { errorBody, mapInBandError, mapProviderError, num, parseArgs, SAFETY_FINISH, safetyRefusal, structuredOutputMode, validateRequest, type SseEvent } from "./shared";

export { scrubProviderMessage, structuredOutputMode } from "./shared";

/**
 * OpenAI Chat Completions protocol (POST {base}/chat/completions, GET {base}/models) — used by OpenAI and by the
 * OpenAI-compatible providers in the registry (Groq, OpenRouter, Mistral, DeepSeek, Z.ai, Moonshot, MiniMax,
 * Alibaba compatible-mode, Cerebras, Together, Fireworks, DeepInfra, HF router, Cloudflare, Vercel).
 *
 * Token mapping to Flowline's NON-OVERLAPPING fields:
 *   prompt_tokens includes cached_tokens         → inputTokens = prompt_tokens − cached − cache_write, cacheRead = cached
 *     (DeepSeek reports prompt_cache_hit_tokens instead; Moonshot adds prompt_tokens_details.cache_write_tokens)
 *   completion_tokens includes reasoning_tokens  → outputTokens = completion_tokens − reasoning, reasoningTokens = reasoning
 *   cache writes not reported                    → cacheWriteTokens = null (unknown, not 0)
 * Provider-reported cost: OpenRouter `usage.cost` (credits, USD-denominated) → providerCostMicros.
 * Reasoning TEXT (`reasoning_content` / `reasoning`) is dropped, never stored or streamed.
 * In-band errors: a 200 whose body carries `error` (OpenRouter) or a non-zero MiniMax `base_resp.status_code`.
 */

export const PROTOCOL_ID = "openai-chat" as const;

/** Providers that document `stream_options.include_usage` (others may not accept the parameter). */
const STREAM_USAGE_OPTION = new Set(["openai", "moonshot", "dashscope", "huggingface"]);

export function buildChatBody(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, opts: { stream?: boolean } = {}): Record<string, unknown> {
  validateRequest(def, model, req, caps, opts.stream);
  const messages: Record<string, unknown>[] = [{ role: "system", content: req.system }];
  for (const m of req.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant")
      messages.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } : {}),
      });
    else messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
  }
  const body: Record<string, unknown> = { model, messages, [def.maxTokensParam ?? "max_completion_tokens"]: req.maxTokens };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  if (structuredOutputMode(caps, req.schema) === "native") body.response_format = { type: "json_schema", json_schema: { name: "result", schema: req.schema, strict: false } };
  if (opts.stream) {
    body.stream = true;
    if (STREAM_USAGE_OPTION.has(def.id)) body.stream_options = { include_usage: true };
  }
  return body;
}

type ChatUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  cost?: unknown;
  cached_tokens?: unknown;
  prompt_cache_hit_tokens?: unknown;
  prompt_cache_miss_tokens?: unknown;
  reasoning_tokens?: unknown;
  prompt_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown };
  completion_tokens_details?: { reasoning_tokens?: unknown };
};

/** Usage → non-overlapping fields (see the header comment). `null` usage = the provider didn't report any. */
export function normaliseChatUsage(u: ChatUsage | undefined | null) {
  if (!u || typeof u !== "object") return null;
  const prompt = num(u.prompt_tokens) ?? 0;
  const completion = num(u.completion_tokens) ?? 0;
  const cached = num(u.prompt_tokens_details?.cached_tokens) ?? num(u.prompt_cache_hit_tokens) ?? num(u.cached_tokens);
  const cacheWrite = num(u.prompt_tokens_details?.cache_write_tokens);
  const reasoning = num(u.completion_tokens_details?.reasoning_tokens) ?? num(u.reasoning_tokens);
  return {
    inputTokens: Math.max(0, prompt - (cached ?? 0) - (cacheWrite ?? 0)),
    cacheReadTokens: cached,
    cacheWriteTokens: cacheWrite,
    outputTokens: Math.max(0, completion - (reasoning ?? 0)),
    reasoningTokens: reasoning,
  };
}

/** OpenRouter reports `usage.cost` in credits (USD-denominated) → micro-USD. */
function providerCost(def: ProviderDefinition, u: ChatUsage | undefined): number | undefined {
  if (def.id !== "openrouter" || !u) return undefined;
  return typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0 ? Math.round(u.cost * 1_000_000) : undefined;
}

/** Usage fields of a result; a provider that reported no usage leaves the tokens UNKNOWN (usageReported: false). */
export function usageFields(u: NormalisedResult["usage"] | null): Pick<NormalisedResult, "usage" | "usageReported"> {
  return u ? { usage: u } : { usage: { inputTokens: 0, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 0, reasoningTokens: null }, usageReported: false };
}

/** Optional result fields, present only when the provider reported them. */
export function extras(cost: number | undefined, serving: string | null | undefined): Pick<NormalisedResult, "providerCostMicros" | "servingProvider"> {
  return { ...(cost != null ? { providerCostMicros: cost } : {}), ...(serving ? { servingProvider: serving } : {}) };
}

function inBandError(def: ProviderDefinition, model: string, d: Record<string, unknown>): HubError | null {
  if (d.error && typeof d.error === "object") return mapInBandError(def, model, d);
  const base = d.base_resp as { status_code?: unknown } | undefined;
  if (base && typeof base === "object" && typeof base.status_code === "number" && base.status_code !== 0) {
    const e = mapProviderError(def, model, 400, null, d);
    e.possibleCharge = true;
    return e;
  }
  return null;
}

export function parseChatResponse(def: ProviderDefinition, requestedModel: string, body: unknown): NormalisedResult {
  const d = (body ?? {}) as {
    model?: unknown;
    provider?: unknown;
    choices?: { message?: { content?: unknown; tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[] }; finish_reason?: unknown }[];
    usage?: ChatUsage;
  };
  const inBand = typeof body === "object" && body ? inBandError(def, requestedModel, body as Record<string, unknown>) : null;
  if (inBand) throw inBand;
  const choice = Array.isArray(d?.choices) ? d.choices[0] : undefined;
  if (!choice || typeof choice !== "object" || !choice.message) throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a response without a message`, { retryable: true, possibleCharge: true });
  const content = choice.message.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("") : "";
  const toolCalls: HubToolCall[] = (Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [])
    .filter((c) => typeof c?.function?.name === "string" && c.function.name)
    .map((c, i) => ({ id: typeof c.id === "string" && c.id ? c.id : `call_${i}`, name: c.function!.name as string, arguments: parseArgs(c.function!.arguments) }));
  const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : null;
  if (finishReason === "error") throw mapInBandError(def, requestedModel, { error: { code: 502 } });
  if (!text && !toolCalls.length && finishReason && SAFETY_FINISH.has(finishReason.toLowerCase())) throw safetyRefusal(def, finishReason);
  const usage = normaliseChatUsage(d.usage);
  return {
    text,
    toolCalls,
    finishReason,
    model: typeof d.model === "string" && d.model ? d.model : requestedModel,
    ...usageFields(usage),
    ...extras(providerCost(def, d.usage), def.routeKind === "gateway" && typeof d.provider === "string" ? d.provider.slice(0, 80) : null),
  };
}

/**
 * Streaming accumulator for `stream: true` (SSE `data:` chunks of chat.completion.chunk, ending with `[DONE]`).
 * Tool-call fragments are assembled by index; nothing partial is ever returned: if the stream ends before a finish
 * reason (or [DONE]) the attempt is AI_STREAM_INTERRUPTED. A chunk carrying `error` (OpenRouter, after the 200)
 * raises the mapped error immediately.
 */
export function chatStream(def: ProviderDefinition, requestedModel: string, onText: (t: string) => void) {
  let text = "";
  let model = requestedModel;
  let finish: string | null = null;
  let done = false;
  let usage: ChatUsage | undefined;
  let serving: string | null = null;
  const calls = new Map<number, { id: string; name: string; args: string }>();
  return {
    onEvent(e: SseEvent) {
      if (e.data === "[DONE]") {
        done = true;
        return;
      }
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(e.data) as Record<string, unknown>;
      } catch {
        return; // not a JSON chunk (keep-alive text): ignored
      }
      const inBand = inBandError(def, requestedModel, d);
      if (inBand) throw inBand;
      if (typeof d.model === "string" && d.model) model = d.model;
      if (typeof d.provider === "string") serving = d.provider.slice(0, 80);
      if (d.usage && typeof d.usage === "object") usage = d.usage as ChatUsage;
      const choice = Array.isArray(d.choices) ? (d.choices[0] as { delta?: { content?: unknown; tool_calls?: unknown[] }; finish_reason?: unknown } | undefined) : undefined;
      if (!choice) return;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) {
        text += delta.content;
        onText(delta.content);
      }
      for (const raw of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const c = raw as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } };
        const i = typeof c.index === "number" ? c.index : 0;
        const cur = calls.get(i) ?? { id: "", name: "", args: "" };
        if (typeof c.id === "string" && c.id) cur.id = c.id;
        if (typeof c.function?.name === "string") cur.name += c.function.name;
        if (typeof c.function?.arguments === "string") cur.args += c.function.arguments;
        calls.set(i, cur);
      }
      if (typeof choice.finish_reason === "string") {
        finish = choice.finish_reason;
        if (finish === "error") throw mapInBandError(def, requestedModel, { error: { code: 502 } });
      }
    },
    result(): NormalisedResult {
      if (!finish && !done) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} ended the stream before the answer finished`, { retryable: true, possibleCharge: true });
      if (!finish && calls.size === 0 && !text) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} ended the stream without an answer`, { retryable: true, possibleCharge: true });
      const toolCalls = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, c]) => c.name)
        .map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, arguments: parseArgs(c.args) }));
      if (!text && !toolCalls.length && finish && SAFETY_FINISH.has(finish.toLowerCase())) throw safetyRefusal(def, finish);
      const u = normaliseChatUsage(usage);
      return {
        text,
        toolCalls,
        finishReason: finish,
        model,
        ...usageFields(u),
        ...extras(providerCost(def, usage), def.routeKind === "gateway" ? serving : null),
      };
    },
  };
}

/** Maps an HTTP error from an OpenAI-compatible provider to a stable, actionable HubError. Never includes the key. */
export function mapChatError(def: ProviderDefinition, model: string, res: SafeResponse): HubError {
  return mapProviderError(def, model, res.status, res.headers, errorBody(res.text()));
}

const MODEL_ID = /^[A-Za-z0-9@][A-Za-z0-9._:/@+\-]{0,199}$/;
export const MAX_MODEL_PAGES = 20;
export const MAX_MODELS = 2000;

export function validModelId(id: unknown): id is string {
  return typeof id === "string" && MODEL_ID.test(id) && !id.includes("..");
}

/**
 * Parses one page of GET /models ({ object: "list", data: [{ id, owned_by }] }, or a bare array as Together
 * documents). OpenAI returns everything in one page; OpenAI-compatible servers may paginate with `has_more` +
 * `last_id` (cursor sent back as `after`). Anything that doesn't match the documented shape is MALFORMED: the caller
 * keeps the last valid snapshot. Extra documented metadata (context_length / context_window) is kept when numeric.
 */
export function parseModelsPage(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { data?: unknown; has_more?: unknown; last_id?: unknown };
  const list = Array.isArray(body) ? body : d && typeof d === "object" && Array.isArray(d.data) ? d.data : null;
  if (!list) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (no data array)");
  const models: DiscoveredModel[] = [];
  for (const m of list as { id?: unknown; owned_by?: unknown; context_length?: unknown; context_window?: unknown; max_context_length?: unknown }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.id)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (an entry has no valid id)");
    models.push({ id: m.id, ownedBy: typeof m.owned_by === "string" ? m.owned_by.slice(0, 120) : null, contextWindow: num(m.context_length) ?? num(m.context_window) ?? num(m.max_context_length) });
  }
  const next = !Array.isArray(body) && d.has_more === true && typeof d.last_id === "string" && d.last_id ? d.last_id : null;
  return { models, next };
}

/** Generic cursor loop shared by every discovery flavour (bounded pages, cursor loops refused, size cap). */
export async function paginate(fetchPage: (cursor: string | undefined) => Promise<{ models: DiscoveredModel[]; next: string | null }>): Promise<DiscoveredModel[]> {
  const out = new Map<string, DiscoveredModel>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_MODEL_PAGES; page++) {
    const { models, next } = await fetchPage(cursor);
    for (const m of models) if (out.size < MAX_MODELS) out.set(m.id, m);
    if (!next) return [...out.values()];
    if (seen.has(next)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list repeats a page cursor");
    seen.add(next);
    cursor = next;
  }
  throw new HubError("AI_CATALOGUE_MALFORMED", `The model list has more than ${MAX_MODEL_PAGES} pages`);
}

export async function listAllModels(fetchPage: (after: string | undefined) => Promise<unknown>): Promise<DiscoveredModel[]> {
  return paginate(async (after) => parseModelsPage(await fetchPage(after)));
}
