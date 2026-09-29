import type { ProviderDefinition } from "../registry";
import { HubError, type AiModelCapabilities, type HubChatRequest, type HubToolCall, type NormalisedResult } from "../types";
import { extras, usageFields } from "./openai-chat";
import { mapInBandError, num, parseArgs, SAFETY_FINISH, safetyRefusal, structuredOutputMode, validateRequest, type SseEvent } from "./shared";

/**
 * OpenAI Responses protocol (POST {base}/responses) — OpenAI (primary API), xAI (primary), Groq, HF router (beta).
 * Sources: developers.openai.com Responses reference; docs.x.ai Responses reference (usage + cost fields).
 *
 * Request: `instructions` (system), `input` items (messages, function_call, function_call_output), `max_output_tokens`,
 * function `tools`, structured output via `text.format` (json_schema) only when the route SUPPORTS it.
 * Usage (non-overlapping): input_tokens includes input_tokens_details.cached_tokens; output_tokens includes
 * output_tokens_details.reasoning_tokens. xAI reports `cost_in_nano_usd` (→ micro-USD); `cost_in_usd_ticks` has no
 * documented unit conversion in the research and is ignored. `reasoning` output items (and their text) are dropped.
 * Streaming: typed SSE events; the final `response.completed` event carries the full response.
 */

export function buildResponsesBody(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, opts: { stream?: boolean } = {}): Record<string, unknown> {
  validateRequest(def, model, req, caps, opts.stream);
  const input: Record<string, unknown>[] = [];
  for (const m of req.messages) {
    if (m.role === "user") input.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      if (m.content) input.push({ role: "assistant", content: m.content });
      for (const c of m.toolCalls ?? []) input.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.arguments) });
    } else input.push({ type: "function_call_output", call_id: m.toolCallId, output: m.content });
  }
  const body: Record<string, unknown> = { model, instructions: req.system, input, max_output_tokens: req.maxTokens };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
  if (structuredOutputMode(caps, req.schema) === "native") body.text = { format: { type: "json_schema", name: "result", schema: req.schema, strict: false } };
  if (opts.stream) body.stream = true;
  return body;
}

type RUsage = { input_tokens?: unknown; output_tokens?: unknown; input_tokens_details?: { cached_tokens?: unknown }; output_tokens_details?: { reasoning_tokens?: unknown }; cost_in_nano_usd?: unknown };

function normaliseUsage(u: RUsage | undefined | null) {
  if (!u || typeof u !== "object") return null;
  const input = num(u.input_tokens) ?? 0;
  const output = num(u.output_tokens) ?? 0;
  const cached = num(u.input_tokens_details?.cached_tokens);
  const reasoning = num(u.output_tokens_details?.reasoning_tokens);
  return { inputTokens: Math.max(0, input - (cached ?? 0)), cacheReadTokens: cached, cacheWriteTokens: null, outputTokens: Math.max(0, output - (reasoning ?? 0)), reasoningTokens: reasoning };
}

function nanoUsd(...vals: unknown[]): number | undefined {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v / 1000);
  return undefined;
}

export function parseResponsesResponse(def: ProviderDefinition, requestedModel: string, body: unknown): NormalisedResult {
  const d = (body ?? {}) as {
    model?: unknown;
    status?: unknown;
    error?: unknown;
    incomplete_details?: { reason?: unknown };
    output?: { type?: unknown; content?: { type?: unknown; text?: unknown }[]; call_id?: unknown; id?: unknown; name?: unknown; arguments?: unknown }[];
    usage?: RUsage;
    cost_in_nano_usd?: unknown;
  };
  if (d.status === "failed" || (d.error && typeof d.error === "object")) throw mapInBandError(def, requestedModel, { error: d.error ?? { code: 502 } });
  if (!Array.isArray(d.output)) throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a response without output`, { retryable: true, possibleCharge: true });
  let text = "";
  const toolCalls: HubToolCall[] = [];
  for (const item of d.output) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) if (c && c.type === "output_text" && typeof c.text === "string") text += c.text;
    } else if (item.type === "function_call" && typeof item.name === "string" && item.name) {
      const id = typeof item.call_id === "string" && item.call_id ? item.call_id : `call_${toolCalls.length}`;
      toolCalls.push({ id, name: item.name, arguments: parseArgs(item.arguments) });
    }
    // "reasoning" items (and any reasoning text) are dropped.
  }
  const incomplete = typeof d.incomplete_details?.reason === "string" ? d.incomplete_details.reason : null;
  const finishReason = d.status === "incomplete" ? `incomplete:${incomplete ?? "unknown"}` : typeof d.status === "string" ? d.status : null;
  if (!text && !toolCalls.length && incomplete && SAFETY_FINISH.has(incomplete.toLowerCase())) throw safetyRefusal(def, incomplete);
  return {
    text,
    toolCalls,
    finishReason: toolCalls.length && finishReason === "completed" ? "tool_calls" : finishReason,
    model: typeof d.model === "string" && d.model ? d.model : requestedModel,
    ...usageFields(normaliseUsage(d.usage)),
    ...extras(nanoUsd(d.usage?.cost_in_nano_usd, d.cost_in_nano_usd), null),
  };
}

/** Streaming: text deltas are forwarded; the completed response is parsed like a non-streamed one. */
export function responsesStream(def: ProviderDefinition, requestedModel: string, onText: (t: string) => void) {
  let completed: unknown = null;
  return {
    onEvent(e: SseEvent) {
      if (e.data === "[DONE]") return;
      let d: { type?: unknown; delta?: unknown; response?: unknown; error?: unknown; code?: unknown; message?: unknown };
      try {
        d = JSON.parse(e.data) as typeof d;
      } catch {
        return;
      }
      const type = typeof d.type === "string" ? d.type : e.event;
      if (type === "response.output_text.delta" && typeof d.delta === "string") onText(d.delta);
      else if (type === "response.completed" || type === "response.incomplete") completed = d.response;
      else if (type === "response.failed") throw mapInBandError(def, requestedModel, { error: (d.response as { error?: unknown } | undefined)?.error ?? { code: 502 } });
      else if (type === "error") throw mapInBandError(def, requestedModel, { error: d.error ?? { code: d.code, type: d.code } });
    },
    result(): NormalisedResult {
      if (!completed) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} ended the stream before the response completed`, { retryable: true, possibleCharge: true });
      return parseResponsesResponse(def, requestedModel, completed);
    },
  };
}
