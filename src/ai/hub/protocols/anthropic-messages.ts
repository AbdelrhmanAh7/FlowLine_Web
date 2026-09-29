import type { ProviderDefinition } from "../registry";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type HubToolCall, type NormalisedResult } from "../types";
import { extras, usageFields, validModelId } from "./openai-chat";
import { badToolArgs, mapInBandError, num, parseArgs, SAFETY_FINISH, safetyRefusal, streamJson, structuredOutputMode, validateRequest, type SseEvent } from "./shared";

/**
 * Anthropic Messages protocol, native (POST {base}/v1/messages with x-api-key + anthropic-version: 2023-06-01).
 * The OpenAI-compatible layer is NOT used: Anthropic documents it as test-only and it ignores response_format and
 * strict tools (platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk).
 *
 * - Tools: `tools[{name, description, input_schema}]`, `tool_use` blocks back, results as `tool_result` blocks in a
 *   user turn. `tool_choice` is never forced (Opus/Sonnet 5.5 reject forced tool_choice with a 400).
 * - Structured output: `output_config.format` (json_schema) only when the route SUPPORTS it (the model list reports
 *   `capabilities.structured_outputs`).
 * - Usage is already non-overlapping: input_tokens (uncached) + cache_read_input_tokens + cache_creation_input_tokens;
 *   output_tokens (thinking isn't reported separately → reasoningTokens null). `thinking` blocks are dropped.
 * - Streaming: SSE events; an `error` event can arrive after the HTTP 200 (mapped, e.g. 529 overloaded).
 * - Models: GET /v1/models, cursor pagination (after_id, limit ≤ 1000, has_more/last_id).
 */

type Block = Record<string, unknown>;

export function buildMessagesBody(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, opts: { stream?: boolean } = {}): Record<string, unknown> {
  validateRequest(def, model, req, caps, opts.stream);
  const messages: { role: "user" | "assistant"; content: Block[] }[] = [];
  const push = (role: "user" | "assistant", blocks: Block[]) => {
    if (!blocks.length) return;
    const last = messages.at(-1);
    // Consecutive turns of the same role are merged (the API expects alternating user/assistant turns).
    if (last && last.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const m of req.messages) {
    if (m.role === "user") push("user", [{ type: "text", text: m.content }]);
    else if (m.role === "assistant") push("assistant", [...(m.content ? [{ type: "text", text: m.content }] : []), ...(m.toolCalls ?? []).map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.arguments }))]);
    else push("user", [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }]);
  }
  const body: Record<string, unknown> = { model, system: req.system, messages, max_tokens: req.maxTokens };
  if (req.temperature !== undefined) {
    if (req.temperature > 1) throw new HubError("AI_BAD_REQUEST", `${def.name} accepts temperature between 0 and 1`);
    body.temperature = req.temperature;
  }
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  if (structuredOutputMode(caps, req.schema) === "native") body.output_config = { format: { type: "json_schema", schema: req.schema } };
  if (opts.stream) body.stream = true;
  return body;
}

type AUsage = { input_tokens?: unknown; output_tokens?: unknown; cache_creation_input_tokens?: unknown; cache_read_input_tokens?: unknown };

/** null = UNKNOWN (no usage, or input / output tokens missing): never read as zero (CXH-08). */
function normaliseUsage(u: AUsage | undefined | null) {
  if (!u || typeof u !== "object") return null;
  const input = num(u.input_tokens);
  const output = num(u.output_tokens);
  if (input == null || output == null) return null;
  return { inputTokens: input, cacheReadTokens: num(u.cache_read_input_tokens), cacheWriteTokens: num(u.cache_creation_input_tokens), outputTokens: output, reasoningTokens: null };
}

function finish(def: ProviderDefinition, text: string, toolCalls: HubToolCall[], stop: string | null) {
  if (!text && !toolCalls.length && stop && SAFETY_FINISH.has(stop.toLowerCase())) throw safetyRefusal(def, stop);
}

export function parseMessagesResponse(def: ProviderDefinition, requestedModel: string, body: unknown): NormalisedResult {
  const d = (body ?? {}) as { type?: unknown; error?: unknown; model?: unknown; content?: Block[]; stop_reason?: unknown; usage?: AUsage };
  if (d.type === "error" || (d.error && typeof d.error === "object")) throw mapInBandError(def, requestedModel, d);
  if (!Array.isArray(d.content)) throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a message without content`, { retryable: true, possibleCharge: true });
  let text = "";
  const toolCalls: HubToolCall[] = [];
  for (const b of d.content) {
    if (b?.type === "text" && typeof b.text === "string") text += b.text;
    else if (b?.type === "tool_use" && typeof b.name === "string" && b.name) {
      // `input` is documented as an object: anything else is corrupt output (never turned into {}).
      if (!b.input || typeof b.input !== "object" || Array.isArray(b.input)) throw badToolArgs(def);
      const input = b.input as Record<string, unknown>;
      toolCalls.push({ id: typeof b.id === "string" && b.id ? b.id : `call_${toolCalls.length}`, name: b.name, arguments: input });
    }
    // thinking / redacted_thinking blocks are dropped (never stored).
  }
  const stop = typeof d.stop_reason === "string" ? d.stop_reason : null;
  finish(def, text, toolCalls, stop);
  return { text, toolCalls, finishReason: stop, model: typeof d.model === "string" && d.model ? d.model : requestedModel, ...usageFields(normaliseUsage(d.usage)), ...extras(undefined, null) };
}

export function messagesStream(def: ProviderDefinition, requestedModel: string, onText: (t: string) => void) {
  let text = "";
  let model = requestedModel;
  let stop: string | null = null;
  let stopped = false;
  const usage: AUsage = {};
  let sawUsage = false;
  const blocks = new Map<number, { kind: "text" | "tool" | "other"; id: string; name: string; json: string }>();
  return {
    onEvent(e: SseEvent) {
      const d = streamJson(def, e.data);
      if (!d) return; // empty keep-alive
      const type = typeof d.type === "string" ? d.type : e.event;
      if (type === "error") throw mapInBandError(def, requestedModel, d);
      if (type === "message_start") {
        const m = d.message as { model?: unknown; usage?: AUsage } | undefined;
        if (typeof m?.model === "string") model = m.model;
        if (m?.usage) {
          Object.assign(usage, m.usage);
          sawUsage = true;
        }
      } else if (type === "content_block_start") {
        const i = typeof d.index === "number" ? d.index : blocks.size;
        const cb = (d.content_block ?? {}) as { type?: unknown; id?: unknown; name?: unknown };
        blocks.set(i, { kind: cb.type === "text" ? "text" : cb.type === "tool_use" ? "tool" : "other", id: typeof cb.id === "string" ? cb.id : "", name: typeof cb.name === "string" ? cb.name : "", json: "" });
      } else if (type === "content_block_delta") {
        const i = typeof d.index === "number" ? d.index : -1;
        const b = blocks.get(i);
        const delta = (d.delta ?? {}) as { type?: unknown; text?: unknown; partial_json?: unknown };
        if (delta.type === "text_delta" && typeof delta.text === "string" && b?.kind !== "other") {
          text += delta.text;
          onText(delta.text);
        } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string" && b?.kind === "tool") b.json += delta.partial_json;
        // thinking_delta / signature_delta: dropped.
      } else if (type === "message_delta") {
        const delta = (d.delta ?? {}) as { stop_reason?: unknown };
        if (typeof delta.stop_reason === "string") stop = delta.stop_reason;
        const u = d.usage as AUsage | undefined;
        if (u) {
          Object.assign(usage, u);
          sawUsage = true;
        }
      } else if (type === "message_stop") stopped = true;
    },
    result(): NormalisedResult {
      if (!stopped) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} ended the stream before message_stop`, { retryable: true, possibleCharge: true });
      const toolCalls: HubToolCall[] = [...blocks.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, b]) => b.kind === "tool" && b.name)
        // No partial_json at all = an empty input (documented); anything present must be a complete JSON object.
        .map(([i, b]) => ({ id: b.id || `call_${i}`, name: b.name, arguments: parseArgs(def, b.json) }));
      finish(def, text, toolCalls, stop);
      return { text, toolCalls, finishReason: stop, model, ...usageFields(sawUsage ? normaliseUsage(usage) : null), ...extras(undefined, null) };
    },
  };
}

/** Capability flag from the model list: `true` / `{ supported: true }` → SUPPORTED; `false` → UNSUPPORTED; else UNKNOWN. */
function flag(v: unknown): "SUPPORTED" | "UNSUPPORTED" | undefined {
  if (v === true || (v && typeof v === "object" && (v as { supported?: unknown }).supported === true)) return "SUPPORTED";
  if (v === false || (v && typeof v === "object" && (v as { supported?: unknown }).supported === false)) return "UNSUPPORTED";
  return undefined;
}

/** One page of GET /v1/models (data[], has_more, last_id; metadata: max_input_tokens, max_tokens, capabilities). */
export function parseAnthropicModelsPage(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { data?: unknown; has_more?: unknown; last_id?: unknown };
  if (!d || typeof d !== "object" || !Array.isArray(d.data)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (no data array)");
  const models: DiscoveredModel[] = [];
  for (const m of d.data as { id?: unknown; max_input_tokens?: unknown; max_tokens?: unknown; capabilities?: Record<string, unknown> }[]) {
    if (!m || typeof m !== "object" || !validModelId(m.id)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (an entry has no valid id)");
    const caps = m.capabilities && typeof m.capabilities === "object" ? m.capabilities : {};
    const structured = flag(caps.structured_outputs);
    const vision = flag(caps.image_input);
    const thinking = caps.thinking ? (flag(caps.thinking) ?? "SUPPORTED") : undefined;
    models.push({
      id: m.id,
      ownedBy: "anthropic",
      contextWindow: num(m.max_input_tokens),
      maxOutputTokens: num(m.max_tokens),
      // Every Messages model takes tools and streams (documented API-wide); per-model flags come from the list.
      capabilities: { tools: "SUPPORTED", streaming: "SUPPORTED", ...(structured ? { structuredOutput: structured } : {}), ...(vision ? { vision } : {}), ...(thinking ? { reasoning: thinking } : {}) },
    });
  }
  return { models, next: d.has_more === true && typeof d.last_id === "string" && d.last_id ? d.last_id : null };
}
