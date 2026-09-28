import type { SafeResponse } from "@/server/egress";
import { redactString } from "@/server/redact";
import type { ProviderDefinition } from "../registry";
import { parseRetryAfter } from "../transport";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type HubToolCall, type NormalisedResult } from "../types";

/**
 * OpenAI Chat Completions protocol (POST {base}/chat/completions, GET {base}/models).
 * Source: the OpenAI OpenAPI specification (https://github.com/openai/openai-openapi) — CreateChatCompletionRequest
 * (messages, tools, response_format json_schema, max_completion_tokens), CreateChatCompletionResponse, CompletionUsage
 * (prompt_tokens_details.cached_tokens, completion_tokens_details.reasoning_tokens), ListModelsResponse.
 *
 * Token mapping to Flowline's NON-OVERLAPPING fields:
 *   prompt_tokens includes cached_tokens         → inputTokens = prompt_tokens − cached_tokens, cacheReadTokens = cached_tokens
 *   completion_tokens includes reasoning_tokens  → outputTokens = completion_tokens − reasoning_tokens, reasoningTokens = reasoning_tokens
 *   cache writes are not reported by this API    → cacheWriteTokens = null (unknown, not 0)
 * Reasoning TEXT some compatible servers return (`reasoning_content` / `reasoning`) is dropped, never stored.
 */

export const PROTOCOL_ID = "openai-chat" as const;

/** Structured output is sent natively only when the route SUPPORTS it; otherwise the JSON is prompted and validated. */
export function structuredOutputMode(caps: AiModelCapabilities, schema?: Record<string, unknown>): "native" | "prompted" | "none" {
  if (!schema) return "none";
  return caps.structuredOutput === "SUPPORTED" ? "native" : "prompted";
}

export function buildChatBody(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities): Record<string, unknown> {
  if (req.tools?.length && caps.tools === "UNSUPPORTED") throw new HubError("AI_CAPABILITY_UNSUPPORTED", `${model} doesn't support tool calls on ${def.name}`);
  if (!Number.isInteger(req.maxTokens) || req.maxTokens < 1) throw new HubError("AI_BAD_REQUEST", "maxTokens must be a positive integer");
  if (req.temperature !== undefined && (req.temperature < 0 || req.temperature > 2)) throw new HubError("AI_BAD_REQUEST", "temperature must be between 0 and 2");
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
  return body;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

function parseArgs(a: unknown): Record<string, unknown> {
  let v = a;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function parseChatResponse(def: ProviderDefinition, requestedModel: string, body: unknown): NormalisedResult {
  const d = body as {
    model?: unknown;
    choices?: { message?: { content?: unknown; tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[] }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown }; completion_tokens_details?: { reasoning_tokens?: unknown } };
  };
  const choice = Array.isArray(d?.choices) ? d.choices[0] : undefined;
  if (!choice || typeof choice !== "object" || !choice.message) throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a response without a message`, { retryable: true });
  const content = choice.message.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("") : "";
  const toolCalls: HubToolCall[] = (Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [])
    .filter((c) => typeof c?.function?.name === "string" && c.function.name)
    .map((c, i) => ({ id: typeof c.id === "string" && c.id ? c.id : `call_${i}`, name: c.function!.name as string, arguments: parseArgs(c.function!.arguments) }));
  const prompt = num(d.usage?.prompt_tokens) ?? 0;
  const completion = num(d.usage?.completion_tokens) ?? 0;
  const cached = num(d.usage?.prompt_tokens_details?.cached_tokens);
  const reasoning = num(d.usage?.completion_tokens_details?.reasoning_tokens);
  return {
    text,
    toolCalls,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
    model: typeof d.model === "string" && d.model ? d.model : requestedModel,
    usage: {
      inputTokens: Math.max(0, prompt - (cached ?? 0)),
      cacheReadTokens: cached,
      cacheWriteTokens: null,
      outputTokens: Math.max(0, completion - (reasoning ?? 0)),
      reasoningTokens: reasoning,
    },
  };
}

/** Provider error text is untrusted and may echo parts of the key: scrub it and cap its length. */
export function scrubProviderMessage(msg: unknown, apiKey: string): string {
  if (typeof msg !== "string") return "";
  const masked = redactString(msg, apiKey ? [apiKey] : []).replace(/\b(sk|key|api)[-_][A-Za-z0-9_*.\-]{3,}/gi, "[REDACTED_API_KEY]");
  return masked.slice(0, 300);
}

/** Maps an HTTP error from the provider to a stable, actionable HubError. Never includes the key. */
export function mapChatError(def: ProviderDefinition, model: string, res: SafeResponse): HubError {
  let err: { message?: unknown; code?: unknown; type?: unknown } = {};
  try {
    err = (res.json<{ error?: typeof err }>()?.error ?? {}) as typeof err;
  } catch {
    /* non-JSON error body */
  }
  const code = typeof err.code === "string" ? err.code : "";
  const s = res.status;
  const opts = { httpStatus: s };
  if (s === 401) return new HubError("AI_AUTH_FAILED", `${def.name} rejected the API key (401). Rotate the key in Settings → AI Providers.`, opts);
  if (s === 403) return new HubError("AI_FORBIDDEN", `${def.name} refused access (403): this key may not be allowed to use ${model}.`, opts);
  if (s === 404 || code === "model_not_found") return new HubError("AI_MODEL_REMOVED", `${model} isn't available on this ${def.name} connection anymore (${s}). Pick another model, or refresh the model list.`, opts);
  if (s === 429 && code === "insufficient_quota") return new HubError("AI_QUOTA_EXCEEDED", `${def.name} says this account has no quota left (429 insufficient_quota). Check the provider's billing.`, opts);
  if (s === 429) return new HubError("AI_RATE_LIMITED", `${def.name} rate-limited the request (429)`, { ...opts, retryable: true, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) });
  if (s === 408) return new HubError("AI_TIMEOUT", `${def.name} timed out (408)`, { ...opts, retryable: true });
  if (s >= 500) return new HubError("AI_PROVIDER_ERROR", `${def.name} had a server error (${s})`, { ...opts, retryable: true, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) });
  // Provider text is never passed through (it may echo the key or the request): only a bounded error code.
  const safeCode = /^[a-z0-9_]{1,40}$/.test(code) ? ` [${code}]` : "";
  return new HubError("AI_BAD_REQUEST", `${def.name} rejected the request (${s})${safeCode}. Check the step settings (model, output schema, max tokens).`, opts);
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,199}$/;
export const MAX_MODEL_PAGES = 20;
export const MAX_MODELS = 2000;

/**
 * Parses one page of GET /models ({ object: "list", data: [{ id, owned_by }] }). OpenAI returns everything in one
 * page; OpenAI-compatible servers may paginate with `has_more` + `last_id` (cursor sent back as `after`).
 * Anything that doesn't match the documented shape is MALFORMED: the caller keeps the last valid snapshot.
 */
export function parseModelsPage(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { data?: unknown; has_more?: unknown; last_id?: unknown };
  if (!d || typeof d !== "object" || !Array.isArray(d.data)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (no data array)");
  const models: DiscoveredModel[] = [];
  for (const m of d.data as { id?: unknown; owned_by?: unknown }[]) {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !MODEL_ID.test(m.id)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (an entry has no valid id)");
    models.push({ id: m.id, ownedBy: typeof m.owned_by === "string" ? m.owned_by.slice(0, 120) : null });
  }
  const next = d.has_more === true && typeof d.last_id === "string" && d.last_id ? d.last_id : null;
  return { models, next };
}

export async function listAllModels(fetchPage: (after: string | undefined) => Promise<unknown>): Promise<DiscoveredModel[]> {
  const out = new Map<string, DiscoveredModel>();
  const seen = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < MAX_MODEL_PAGES; page++) {
    const { models, next } = parseModelsPage(await fetchPage(after));
    for (const m of models) if (out.size < MAX_MODELS) out.set(m.id, m);
    if (!next) return [...out.values()];
    if (seen.has(next)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list repeats a page cursor");
    seen.add(next);
    after = next;
  }
  throw new HubError("AI_CATALOGUE_MALFORMED", `The model list has more than ${MAX_MODEL_PAGES} pages`);
}
