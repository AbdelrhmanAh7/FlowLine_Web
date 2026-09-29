import type { ProviderDefinition } from "../registry";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type HubToolCall, type NormalisedResult } from "../types";
import { extras, usageFields, validModelId } from "./openai-chat";
import { mapInBandError, num, parseArgs, SAFETY_FINISH, safetyRefusal, streamJson, structuredOutputMode, validateRequest, type SseEvent } from "./shared";

/**
 * Cohere v2 chat, native (POST https://api.cohere.com/v2/chat; models: GET https://api.cohere.com/v1/models with
 * endpoint=chat, page_size, page_token/next_page_token). Sources: docs.cohere.com/reference/chat, /list-models.
 *
 * - Messages: system / user / assistant (+ tool_calls) / tool (tool_call_id); tools `{type:"function", function}`.
 * - Structured output: `response_format {type:"json_object", json_schema}` only when the route SUPPORTS it.
 * - Usage: `usage.billed_units.{input_tokens, output_tokens}` (what is billed). `cached_tokens` semantics (subset of
 *   input or not) aren't documented in the research → cache tokens stay unknown (null). `tool_plan` text is dropped.
 * - Streaming: typed events (message-start, content-delta, tool-call-start/-delta/-end, message-end).
 */

export function buildCohereBody(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, opts: { stream?: boolean } = {}): Record<string, unknown> {
  validateRequest(def, model, req, caps, opts.stream);
  const messages: Record<string, unknown>[] = [{ role: "system", content: req.system }];
  for (const m of req.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant")
      messages.push({
        role: "assistant",
        ...(m.content ? { content: m.content } : {}),
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } : {}),
      });
    else messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
  }
  const body: Record<string, unknown> = { model, messages, max_tokens: req.maxTokens };
  if (req.temperature !== undefined) {
    if (req.temperature > 1) throw new HubError("AI_BAD_REQUEST", `${def.name} accepts temperature between 0 and 1`);
    body.temperature = req.temperature;
  }
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  if (structuredOutputMode(caps, req.schema) === "native") body.response_format = { type: "json_object", json_schema: req.schema };
  if (opts.stream) body.stream = true;
  return body;
}

type CUsage = { billed_units?: { input_tokens?: unknown; output_tokens?: unknown }; tokens?: { input_tokens?: unknown; output_tokens?: unknown } };

function normaliseUsage(u: CUsage | undefined | null) {
  if (!u || typeof u !== "object") return null;
  const b = u.billed_units ?? u.tokens;
  if (!b || typeof b !== "object") return null;
  const input = num(b.input_tokens);
  const output = num(b.output_tokens);
  // Both billed counts are needed; a missing one is UNKNOWN, never zero (CXH-08).
  if (input == null || output == null) return null;
  return { inputTokens: input, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: output, reasoningTokens: null };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c && typeof c === "object" && (c as { type?: unknown }).type === "text" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join("");
}

export function parseCohereResponse(def: ProviderDefinition, requestedModel: string, body: unknown): NormalisedResult {
  const d = (body ?? {}) as { message?: { content?: unknown; tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[] }; finish_reason?: unknown; usage?: CUsage; error?: unknown };
  if (d.error && typeof d.error === "object") throw mapInBandError(def, requestedModel, d);
  if (!d.message || typeof d.message !== "object") throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a response without a message`, { retryable: true, possibleCharge: true });
  const text = textOf(d.message.content);
  const toolCalls: HubToolCall[] = (Array.isArray(d.message.tool_calls) ? d.message.tool_calls : [])
    .filter((c) => typeof c?.function?.name === "string" && c.function.name)
    .map((c, i) => ({ id: typeof c.id === "string" && c.id ? c.id : `call_${i}`, name: c.function!.name as string, arguments: parseArgs(def, c.function!.arguments) }));
  const finishReason = typeof d.finish_reason === "string" ? d.finish_reason : null;
  if (finishReason === "ERROR") throw mapInBandError(def, requestedModel, { error: { code: 502 } });
  if (!text && !toolCalls.length && finishReason && SAFETY_FINISH.has(finishReason.toLowerCase())) throw safetyRefusal(def, finishReason);
  return { text, toolCalls, finishReason, model: requestedModel, ...usageFields(normaliseUsage(d.usage)), ...extras(undefined, null) };
}

export function cohereStream(def: ProviderDefinition, requestedModel: string, onText: (t: string) => void) {
  let text = "";
  let finishReason: string | null = null;
  let usage: CUsage | null = null;
  const calls = new Map<number, { id: string; name: string; args: string }>();
  return {
    onEvent(e: SseEvent) {
      if (e.data === "[DONE]") return;
      const d = streamJson(def, e.data) as { type?: unknown; index?: unknown; delta?: { message?: { content?: { text?: unknown }; tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } } }; finish_reason?: unknown; usage?: CUsage }; error?: unknown } | null;
      if (!d) return; // empty keep-alive
      const type = typeof d.type === "string" ? d.type : e.event;
      if (d.error && typeof d.error === "object") throw mapInBandError(def, requestedModel, d);
      const i = typeof d.index === "number" ? d.index : 0;
      if (type === "content-delta") {
        const t = d.delta?.message?.content?.text;
        if (typeof t === "string" && t) {
          text += t;
          onText(t);
        }
      } else if (type === "tool-call-start" || type === "tool-call-delta") {
        const c = d.delta?.message?.tool_calls;
        const cur = calls.get(i) ?? { id: "", name: "", args: "" };
        if (typeof c?.id === "string" && c.id) cur.id = c.id;
        if (typeof c?.function?.name === "string") cur.name += c.function.name;
        if (typeof c?.function?.arguments === "string") cur.args += c.function.arguments;
        calls.set(i, cur);
      } else if (type === "message-end") {
        finishReason = typeof d.delta?.finish_reason === "string" ? d.delta.finish_reason : "COMPLETE";
        usage = d.delta?.usage ?? null;
        if (finishReason === "ERROR") throw mapInBandError(def, requestedModel, { error: { code: 502 } });
      }
    },
    result(): NormalisedResult {
      if (!finishReason) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} ended the stream before message-end`, { retryable: true, possibleCharge: true });
      const toolCalls = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, c]) => c.name)
        .map(([idx, c]) => ({ id: c.id || `call_${idx}`, name: c.name, arguments: parseArgs(def, c.args) }));
      if (!text && !toolCalls.length && SAFETY_FINISH.has(finishReason.toLowerCase())) throw safetyRefusal(def, finishReason);
      return { text, toolCalls, finishReason, model: requestedModel, ...usageFields(normaliseUsage(usage)), ...extras(undefined, null) };
    },
  };
}

/** One page of GET /v1/models?endpoint=chat (models[{name, context_length, endpoints, finetuned, …}], next_page_token). */
export function parseCohereModelsPage(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { models?: unknown; next_page_token?: unknown };
  if (!d || typeof d !== "object" || !Array.isArray(d.models)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (no models array)");
  const models: DiscoveredModel[] = [];
  for (const m of d.models as { name?: unknown; context_length?: unknown; endpoints?: unknown; is_deprecated?: unknown }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.name)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (an entry has no valid name)");
    if (Array.isArray(m.endpoints) && !m.endpoints.includes("chat")) continue;
    models.push({ id: m.name, ownedBy: "cohere", contextWindow: num(m.context_length) });
  }
  return { models, next: typeof d.next_page_token === "string" && d.next_page_token ? d.next_page_token : null };
}
