/**
 * TEST DOUBLE — multi-provider AI surfaces for the hub (used only with FLOWLINE_ENV=test). The hub rewrites every
 * provider's documented base URL to `<override>/<providerId><documented path>`; this module answers those paths in
 * each provider's DOCUMENTED shape (per artifacts/ai-hub/research/providers-2026-09-29.md):
 *   - OpenAI-compatible Chat Completions under any base path (…/chat/completions) → delegated to the OpenAI double;
 *   - OpenAI Responses (…/responses), Anthropic Messages (/anthropic/v1/messages), Gemini generateContent /
 *     streamGenerateContent (/gemini/v1beta/models/<m>:…), Cohere v2 chat (/cohere/v2/chat), each with SSE streaming;
 *   - model lists per discovery flavour (Anthropic cursor, Gemini pageToken, Cohere page_token, OpenRouter offset +
 *     pricing, Vercel pricing/tags, DeepInfra public array, Fireworks pageToken, Cloudflare page/per_page envelope).
 * Answers come from the same deterministic rules as the rest of the double (it is NOT a model).
 * Quirk faults: POST /__fake/hub/fault { provider?, path?, mode, status?, body?, headers?, times } where mode is
 *   "http" (any status + documented error body verbatim), "json" (a 200 with a canned body), "stream_cut" (stream
 *   stops without its terminal event), "stream_error" (an error event/chunk after the 200), "slow_stream" (chunks
 *   delayed by delayMs — cancellation tests), "hang" (never answers — timeout tests).
 * Keys: any "sk-fake-…" is accepted except ones containing "revoked"; only SHA-256 of keys is recorded.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";

export interface InnerMsg {
  role: string;
  content: string;
  tool_name?: string;
  tool_calls?: { function: { name: string } }[];
}
export interface InnerReq {
  model: string;
  format?: unknown;
  messages: InnerMsg[];
  tools?: { function: { name: string; description?: string; parameters?: unknown } }[];
}
export interface InnerOut {
  status: number;
  content: string;
  toolCalls: { name: string; arguments: Record<string, unknown> }[];
  promptTokens: number;
  outputTokens: number;
}

export interface HubFault {
  provider?: string;
  path?: "chat" | "models";
  mode: "http" | "json" | "stream_cut" | "stream_error" | "slow_stream" | "hang";
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
  /** stream_cut: number of events sent before the connection is cut (default 2). */
  cutAfter?: number;
  times: number;
}

export interface HubRecord {
  at: string;
  provider: string;
  method: string;
  path: string;
  query: Record<string, string>;
  auth: "bearer" | "x-api-key" | "x-goog-api-key" | "none";
  keySha256: string | null;
  headers: Record<string, string>;
  body: unknown;
  stream: boolean;
}

export const hub = {
  requests: [] as HubRecord[],
  faults: [] as HubFault[],
  removed: new Set<string>(),
  /**
   * Providers whose model list answers WITHOUT checking the key, as DeepInfra and Vercel document theirs
   * (POST /__fake/hub/public). Off by default, so the per-adapter auth assertions keep their shape.
   */
  publicListing: new Set<string>(),
};

export function resetHub() {
  hub.requests = [];
  hub.faults = [];
  hub.removed = new Set();
  hub.publicListing = new Set();
}

// CodeQL `js/insufficient-password-hash` (alert #10): used in tests. A fingerprint of the fake "sk-fake-…" key a request
// carried, so tests can assert which key was sent without the log holding it; nothing is stored or verified as a
// password. Tests compare it with their own SHA-256. See docs/security/codeql-triage-hashing.md.
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Models per native provider (OpenAI-compatible providers share the OpenAI double's list). */
export const NATIVE_MODELS: Record<string, string[]> = {
  anthropic: ["fake-claude", "fake-claude-json", "fake-claude-old"],
  gemini: ["fake-gemini", "fake-gemini-pro", "fake-gemini-3"],
  cohere: ["fake-command", "fake-command-json"],
};

/** Providers whose model ids come from their own listing / static catalogue (not the OpenAI double's list). */
const OWN_MODEL_IDS = new Set(["openrouter", "vercel-gateway", "deepinfra", "fireworks", "cloudflare", "zai", "dashscope"]);
const knownChatModel = (provider: string, model: string, oaModels: string[]) =>
  !hub.removed.has(`${provider}/${model}`) && !hub.removed.has(model) && (oaModels.includes(model) || (OWN_MODEL_IDS.has(provider) && /^[\w@.:/-]{1,200}$/.test(model) && !model.includes("missing")));

const INTERESTING_HEADERS = ["anthropic-version", "anthropic-workspace-id", "openai-organization", "openai-project", "x-hf-bill-to", "accept", "content-type"];

function keyOf(req: IncomingMessage): { key: string | null; auth: HubRecord["auth"] } {
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (bearer) return { key: bearer, auth: "bearer" };
  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x) return { key: x, auth: "x-api-key" };
  const g = req.headers["x-goog-api-key"];
  if (typeof g === "string" && g) return { key: g, auth: "x-goog-api-key" };
  return { key: null, auth: "none" };
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

function takeFault(provider: string, path: "chat" | "models") {
  const f = hub.faults.find((x) => x.times > 0 && (!x.provider || x.provider === provider) && (x.path ?? "chat") === path);
  if (f) f.times--;
  return f;
}

/** Documented 401 bodies per provider family (used for invalid / revoked keys). */
function unauthorized(res: ServerResponse, provider: string) {
  if (provider === "anthropic") return json(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
  if (provider === "gemini") return json(res, 401, { error: { code: 401, message: "API key not valid.", status: "UNAUTHENTICATED" } });
  if (provider === "cohere") return json(res, 401, { message: "invalid api token" });
  return json(res, 401, { error: { message: "Incorrect API key provided.", type: "invalid_request_error", code: "invalid_api_key" } });
}

/* ───────────── SSE writer ───────────── */

function sse(res: ServerResponse, events: { event?: string; data: unknown }[], opts: { cutAfter?: number; delayMs?: number; errorAfter?: { event?: string; data: unknown } } = {}) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.write(": keep-alive\n\n");
  let i = 0;
  const next = () => {
    if (res.destroyed) return;
    if (opts.cutAfter != null && i >= opts.cutAfter) return void res.destroy();
    if (opts.errorAfter && i >= Math.min(1, events.length)) {
      const e = opts.errorAfter;
      res.write(`${e.event ? `event: ${e.event}\n` : ""}data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}\n\n`);
      return void res.end();
    }
    if (i >= events.length) return void res.end();
    const e = events[i++]!;
    // Split each event across two writes to exercise chunk-boundary handling in the parser.
    const text = `${e.event ? `event: ${e.event}\n` : ""}data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}\n\n`;
    const mid = Math.floor(text.length / 2);
    res.write(text.slice(0, mid));
    res.write(text.slice(mid));
    if (opts.delayMs) setTimeout(next, opts.delayMs);
    else setImmediate(next);
  };
  next();
}

function chunks(text: string) {
  if (text.length < 4) return [text];
  const a = Math.floor(text.length / 3);
  return [text.slice(0, a), text.slice(a, 2 * a), text.slice(2 * a)];
}

/* ───────────── translations to the rule engine ───────────── */

/** A schema PROMPTED in the system text (routes whose structured output isn't SUPPORTED): the rules still fill it. */
function prompted(system: string): unknown {
  const m = /matching this JSON schema: (\{[\s\S]*\})\s*$/.exec(system);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return undefined;
  }
}

type Run = (r: InnerReq) => Promise<InnerOut>;

const fakeUsage = (o: InnerOut, model: string) => ({ cached: model.includes("cache") ? Math.floor(o.promptTokens / 2) : 0, reasoning: model.includes("reason") ? 7 : 0 });

async function responses(provider: string, body: Record<string, unknown>, res: ServerResponse, run: Run, fault: HubFault | undefined) {
  const model = String(body.model ?? "");
  const input = Array.isArray(body.input) ? (body.input as Record<string, unknown>[]) : [];
  const names = new Map<string, string>();
  const messages: InnerMsg[] = [{ role: "system", content: String(body.instructions ?? "") }];
  for (const it of input) {
    if (it.type === "function_call") {
      names.set(String(it.call_id), String(it.name));
      messages.push({ role: "assistant", content: "", tool_calls: [{ function: { name: String(it.name) } }] });
    } else if (it.type === "function_call_output") messages.push({ role: "tool", content: String(it.output ?? ""), tool_name: names.get(String(it.call_id)) });
    else messages.push({ role: String(it.role ?? "user"), content: typeof it.content === "string" ? it.content : "" });
  }
  const tools = Array.isArray(body.tools) ? (body.tools as { name: string; parameters?: unknown }[]).map((t) => ({ function: { name: t.name, parameters: t.parameters } })) : undefined;
  const format = (body.text as { format?: { schema?: unknown } } | undefined)?.format?.schema ?? prompted(String(body.instructions ?? ""));
  const o = await run({ model, messages, ...(format ? { format } : {}), ...(tools || String(body.instructions ?? "").includes("You are an agent inside Flowline") ? { tools: tools ?? [] } : {}) });
  if (o.status >= 400) return json(res, o.status, { error: { message: "server error", type: "server_error" } });
  const u = fakeUsage(o, model);
  const output = [
    ...(model.includes("reason") ? [{ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "HIDDEN-CHAIN-OF-THOUGHT-CANARY" }] }] : []),
    ...(o.toolCalls.length ? o.toolCalls.map((c, i) => ({ type: "function_call", call_id: `fc_${i}`, name: c.name, arguments: JSON.stringify(c.arguments) })) : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: o.content }] }]),
  ];
  const response = {
    id: `resp_fake_${hub.requests.length}`,
    object: "response",
    model,
    status: "completed",
    output,
    usage: { input_tokens: o.promptTokens, input_tokens_details: { cached_tokens: u.cached }, output_tokens: o.outputTokens + u.reasoning, output_tokens_details: { reasoning_tokens: u.reasoning }, ...(provider === "xai" ? { cost_in_nano_usd: 1_234_000 } : {}) },
  };
  if (body.stream !== true) return json(res, 200, response);
  const deltas = o.toolCalls.length ? [] : chunks(o.content).map((d) => ({ event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: d } }));
  const events = [{ event: "response.created", data: { type: "response.created", response: { ...response, status: "in_progress", output: [] } } }, ...deltas, { event: "response.completed", data: { type: "response.completed", response } }];
  return sse(res, events, streamOpts(fault, { event: "error", data: { type: "error", code: "server_error", message: "boom" } }));
}

function streamOpts(fault: HubFault | undefined, errorEvent: { event?: string; data: unknown }) {
  if (fault?.mode === "stream_cut") return { cutAfter: fault.cutAfter ?? 2 };
  if (fault?.mode === "stream_error") return { errorAfter: (fault.body as { event?: string; data: unknown } | undefined) ?? errorEvent };
  if (fault?.mode === "slow_stream") return { delayMs: fault.delayMs ?? 300 };
  return {};
}

async function anthropic(req: IncomingMessage, body: Record<string, unknown>, res: ServerResponse, run: Run, fault: HubFault | undefined) {
  if (req.headers["anthropic-version"] !== "2023-06-01") return json(res, 400, { type: "error", error: { type: "invalid_request_error", message: "anthropic-version header is required" } });
  const model = String(body.model ?? "");
  const system = String(body.system ?? "");
  const names = new Map<string, string>();
  const messages: InnerMsg[] = [{ role: "system", content: system }];
  for (const m of (body.messages ?? []) as { role: string; content: { type: string; text?: string; id?: string; name?: string; tool_use_id?: string; content?: string }[] }[]) {
    for (const b of m.content) {
      if (b.type === "text") messages.push({ role: m.role, content: b.text ?? "" });
      else if (b.type === "tool_use") {
        names.set(String(b.id), String(b.name));
        messages.push({ role: "assistant", content: "", tool_calls: [{ function: { name: String(b.name) } }] });
      } else if (b.type === "tool_result") messages.push({ role: "tool", content: String(b.content ?? ""), tool_name: names.get(String(b.tool_use_id)) });
    }
  }
  const tools = Array.isArray(body.tools) ? (body.tools as { name: string; input_schema?: unknown }[]).map((t) => ({ function: { name: t.name, parameters: t.input_schema } })) : undefined;
  const format = (body.output_config as { format?: { schema?: unknown } } | undefined)?.format?.schema ?? prompted(system);
  const o = await run({ model, messages, ...(format ? { format } : {}), ...(tools || system.includes("You are an agent inside Flowline") ? { tools: tools ?? [] } : {}) });
  if (o.status >= 400) return json(res, 500, { type: "error", error: { type: "api_error", message: "Internal server error" } });
  const content = [
    ...(model.includes("reason") ? [{ type: "thinking", thinking: "HIDDEN-CHAIN-OF-THOUGHT-CANARY", signature: "x" }] : []),
    ...(o.toolCalls.length ? o.toolCalls.map((c, i) => ({ type: "tool_use", id: `toolu_${i}`, name: c.name, input: c.arguments })) : [{ type: "text", text: o.content }]),
  ];
  const usage = { input_tokens: o.promptTokens, output_tokens: o.outputTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: model.includes("cache") ? 11 : 0 };
  const stop = o.toolCalls.length ? "tool_use" : "end_turn";
  if (body.stream !== true) return json(res, 200, { id: "msg_fake", type: "message", role: "assistant", model, content, stop_reason: stop, usage });
  const events: { event: string; data: unknown }[] = [{ event: "message_start", data: { type: "message_start", message: { id: "msg_fake", model, usage: { input_tokens: usage.input_tokens, output_tokens: 1, cache_read_input_tokens: usage.cache_read_input_tokens, cache_creation_input_tokens: 0 } } } }];
  content.forEach((b, i) => {
    if (b.type === "text") {
      events.push({ event: "content_block_start", data: { type: "content_block_start", index: i, content_block: { type: "text", text: "" } } });
      for (const d of chunks(String((b as { text: string }).text))) events.push({ event: "content_block_delta", data: { type: "content_block_delta", index: i, delta: { type: "text_delta", text: d } } });
    } else if (b.type === "tool_use") {
      const t = b as { id: string; name: string; input: unknown };
      events.push({ event: "content_block_start", data: { type: "content_block_start", index: i, content_block: { type: "tool_use", id: t.id, name: t.name, input: {} } } });
      const js = JSON.stringify(t.input);
      for (const d of chunks(js)) events.push({ event: "content_block_delta", data: { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: d } } });
    } else {
      events.push({ event: "content_block_start", data: { type: "content_block_start", index: i, content_block: { type: "thinking", thinking: "" } } });
      events.push({ event: "content_block_delta", data: { type: "content_block_delta", index: i, delta: { type: "thinking_delta", thinking: "HIDDEN-CHAIN-OF-THOUGHT-CANARY" } } });
    }
    events.push({ event: "content_block_stop", data: { type: "content_block_stop", index: i } });
  });
  events.push({ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: usage.output_tokens } } }, { event: "message_stop", data: { type: "message_stop" } });
  return sse(res, events, streamOpts(fault, { event: "error", data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }));
}

async function gemini(model: string, stream: boolean, body: Record<string, unknown>, res: ServerResponse, run: Run, fault: HubFault | undefined) {
  const system = ((body.systemInstruction as { parts?: { text?: string }[] } | undefined)?.parts ?? []).map((p) => p.text ?? "").join("");
  const messages: InnerMsg[] = [{ role: "system", content: system }];
  for (const c of (body.contents ?? []) as { role: string; parts: { text?: string; functionCall?: { name: string }; functionResponse?: { name: string; response?: { content?: string } } }[] }[]) {
    for (const p of c.parts) {
      if (typeof p.text === "string") messages.push({ role: c.role === "model" ? "assistant" : "user", content: p.text });
      else if (p.functionCall) messages.push({ role: "assistant", content: "", tool_calls: [{ function: { name: p.functionCall.name } }] });
      else if (p.functionResponse) messages.push({ role: "tool", content: String(p.functionResponse.response?.content ?? ""), tool_name: p.functionResponse.name });
    }
  }
  const decl = ((body.tools as { functionDeclarations?: { name: string; parameters?: unknown }[] }[] | undefined) ?? []).flatMap((t) => t.functionDeclarations ?? []);
  const format = (body.generationConfig as { responseSchema?: unknown } | undefined)?.responseSchema ?? prompted(system);
  const o = await run({ model, messages, ...(format ? { format } : {}), ...(decl.length || system.includes("You are an agent inside Flowline") ? { tools: decl.map((d) => ({ function: { name: d.name, parameters: d.parameters } })) } : {}) });
  if (o.status >= 400) return json(res, 500, { error: { code: 500, message: "Internal error", status: "INTERNAL" } });
  const parts = [...(model.includes("pro") ? [{ text: "HIDDEN-CHAIN-OF-THOUGHT-CANARY", thought: true }] : []), ...(o.toolCalls.length ? o.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.arguments } })) : [{ text: o.content }])];
  const usageMetadata = { promptTokenCount: o.promptTokens, candidatesTokenCount: o.outputTokens, totalTokenCount: o.promptTokens + o.outputTokens, ...(model.includes("pro") ? { thoughtsTokenCount: 5 } : {}) };
  const full = { candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata, modelVersion: model };
  if (!stream) return json(res, 200, full);
  const texts = o.toolCalls.length ? [] : chunks(o.content);
  const events = [
    ...texts.slice(0, -1).map((t) => ({ data: { candidates: [{ content: { role: "model", parts: [{ text: t }] } }], modelVersion: model } })),
    { data: { candidates: [{ content: { role: "model", parts: o.toolCalls.length ? parts : [{ text: texts.at(-1) ?? "" }] }, finishReason: "STOP" }], usageMetadata, modelVersion: model } },
  ];
  return sse(res, events, streamOpts(fault, { data: { error: { code: 503, message: "The model is overloaded.", status: "UNAVAILABLE" } } }));
}

async function cohere(body: Record<string, unknown>, res: ServerResponse, run: Run, fault: HubFault | undefined) {
  const model = String(body.model ?? "");
  const names = new Map<string, string>();
  const messages: InnerMsg[] = [];
  for (const m of (body.messages ?? []) as { role: string; content?: string; tool_calls?: { id: string; function: { name: string } }[]; tool_call_id?: string }[]) {
    for (const c of m.tool_calls ?? []) names.set(c.id, c.function.name);
    messages.push({ role: m.role, content: m.content ?? "", ...(m.role === "tool" ? { tool_name: names.get(String(m.tool_call_id)) } : {}), ...(m.tool_calls ? { tool_calls: m.tool_calls.map((c) => ({ function: { name: c.function.name } })) } : {}) });
  }
  const tools = Array.isArray(body.tools) ? (body.tools as { function: { name: string; parameters?: unknown } }[]).map((t) => ({ function: t.function })) : undefined;
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const format = (body.response_format as { json_schema?: unknown } | undefined)?.json_schema ?? prompted(system);
  const o = await run({ model, messages, ...(format ? { format } : {}), ...(tools || system.includes("You are an agent inside Flowline") ? { tools: tools ?? [] } : {}) });
  if (o.status >= 400) return json(res, 500, { message: "internal server error" });
  const calls = o.toolCalls.map((c, i) => ({ id: `tc_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } }));
  const usage = { billed_units: { input_tokens: o.promptTokens, output_tokens: o.outputTokens }, tokens: { input_tokens: o.promptTokens + 20, output_tokens: o.outputTokens } };
  const finish = calls.length ? "TOOL_CALL" : "COMPLETE";
  const message = { role: "assistant", ...(calls.length ? { tool_plan: "HIDDEN-CHAIN-OF-THOUGHT-CANARY", tool_calls: calls } : { content: [{ type: "text", text: o.content }] }) };
  if (body.stream !== true) return json(res, 200, { id: "c_fake", finish_reason: finish, message, usage });
  const events: { event: string; data: unknown }[] = [{ event: "message-start", data: { type: "message-start", id: "c_fake" } }];
  if (calls.length)
    calls.forEach((c, i) => {
      events.push({ event: "tool-call-start", data: { type: "tool-call-start", index: i, delta: { message: { tool_calls: { id: c.id, type: "function", function: { name: c.function.name, arguments: "" } } } } } });
      for (const d of chunks(c.function.arguments)) events.push({ event: "tool-call-delta", data: { type: "tool-call-delta", index: i, delta: { message: { tool_calls: { function: { arguments: d } } } } } });
      events.push({ event: "tool-call-end", data: { type: "tool-call-end", index: i } });
    });
  else for (const d of chunks(o.content)) events.push({ event: "content-delta", data: { type: "content-delta", index: 0, delta: { message: { content: { text: d } } } } });
  events.push({ event: "message-end", data: { type: "message-end", delta: { finish_reason: finish, usage } } });
  return sse(res, events, streamOpts(fault, { event: "message-end", data: { type: "message-end", delta: { finish_reason: "ERROR" } } }));
}

/* ───────────── model lists ───────────── */

function page<T>(all: T[], start: number, size: number) {
  return { items: all.slice(start, start + size), more: start + size < all.length };
}

function listModels(provider: string, sub: string, url: URL, res: ServerResponse, oaModels: string[]): boolean {
  const removed = (m: string) => hub.removed.has(`${provider}/${m}`) || hub.removed.has(m);
  if (provider === "anthropic" && sub === "/v1/models") {
    const all = NATIVE_MODELS.anthropic!.filter((m) => !removed(m));
    const after = url.searchParams.get("after_id");
    const p = page(all, after ? all.indexOf(after) + 1 : 0, 2);
    json(res, 200, {
      data: p.items.map((id) => ({ type: "model", id, display_name: id, created_at: "2026-01-01T00:00:00Z", max_input_tokens: 200000, max_tokens: 64000, capabilities: { structured_outputs: id.includes("json") ? { supported: true } : { supported: false }, image_input: { supported: true } } })),
      has_more: p.more,
      first_id: p.items[0] ?? null,
      last_id: p.items.at(-1) ?? null,
    });
    return true;
  }
  if (provider === "gemini" && sub === "/v1beta/models") {
    const all = [...NATIVE_MODELS.gemini!.filter((m) => !removed(m)), "fake-embedding"];
    const token = url.searchParams.get("pageToken");
    const p = page(all, token ? Number(token) : 0, 2);
    json(res, 200, {
      models: p.items.map((id) => ({ name: `models/${id}`, inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: id.includes("embedding") ? ["embedContent"] : ["generateContent", "streamGenerateContent", "countTokens"], thinking: id.includes("pro") })),
      ...(p.more ? { nextPageToken: String((token ? Number(token) : 0) + 2) } : {}),
    });
    return true;
  }
  if (provider === "cohere" && sub === "/v1/models") {
    const all = [...NATIVE_MODELS.cohere!.filter((m) => !removed(m)), "fake-embed"];
    const token = url.searchParams.get("page_token");
    const p = page(all, token ? Number(token) : 0, 2);
    json(res, 200, { models: p.items.map((name) => ({ name, endpoints: name.includes("embed") ? ["embed"] : ["chat", "generate"], finetuned: false, context_length: 128000, features: [] })), ...(p.more ? { next_page_token: String((token ? Number(token) : 0) + 2) } : {}) });
    return true;
  }
  if (provider === "openrouter" && sub === "/api/v1/models") {
    const all = [
      { id: "openai/fake-gpt-mini", pricing: { prompt: "0.00000015", completion: "0.0000006" }, supported_parameters: ["tools", "response_format", "structured_outputs"] },
      { id: "vendor/fake-free:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
      { id: "vendor/fake-notools", pricing: { prompt: "0.000001", completion: "0.000002" }, supported_parameters: ["temperature"] },
      { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" }, supported_parameters: ["tools"] },
    ].filter((m) => !removed(m.id));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const p = page(all, offset, 2);
    json(res, 200, { data: p.items.map((m) => ({ ...m, context_length: 128000, top_provider: { max_completion_tokens: 16384 } })), total_count: all.length });
    return true;
  }
  if (provider === "vercel-gateway" && sub === "/v1/models") {
    json(res, 200, { data: [{ id: "openai/fake-gpt-mini", context_window: 128000, max_tokens: 16384, type: "language", tags: ["tool-use"], pricing: { input: "0.00000015", output: "0.0000006" } }, { id: "anthropic/fake-claude", context_window: 200000, type: "language", tags: ["tool-use", "reasoning"], pricing: { input: "0.000001", output: "0.000005", input_cache_read: "0.0000001" } }].filter((m) => !removed(m.id)) });
    return true;
  }
  if (provider === "deepinfra" && sub === "/models/list") {
    json(res, 200, [{ model_name: "meta-llama/fake-llama", type: "text-generation", max_tokens: 131072, pricing: { type: "tokens" }, deprecated: null }, { model_name: "old/deprecated-model", deprecated: 1700000000 }, { model_name: "fake-gpt-mini", max_tokens: 64000 }]);
    return true;
  }
  if (provider === "fireworks" && sub === "/v1/accounts/fireworks/models") {
    const all = ["accounts/fireworks/models/fake-fire", "accounts/fireworks/models/fake-gpt-mini", "accounts/fireworks/models/fake-notools"];
    const token = url.searchParams.get("pageToken");
    const p = page(all, token ? Number(token) : 0, 2);
    json(res, 200, { models: p.items.map((name) => ({ name, contextLength: 131072, supportsTools: !name.includes("notools"), supportsImageInput: false })), ...(p.more ? { nextPageToken: String((token ? Number(token) : 0) + 2) } : {}) });
    return true;
  }
  if (provider === "cloudflare" && /^\/client\/v4\/accounts\/[A-Za-z0-9]+\/ai\/models\/search$/.test(sub)) {
    const all = ["@cf/meta/fake-llama", "@cf/openai/fake-gpt-mini", "@cf/fake/third"];
    const pg = Number(url.searchParams.get("page") ?? 1);
    const per = Number(url.searchParams.get("per_page") ?? 100);
    const items = all.slice((pg - 1) * per, pg * per);
    json(res, 200, { success: true, errors: [], messages: [], result: items.map((name) => ({ id: name, name, task: { name: "Text Generation" } })), result_info: { page: pg, per_page: per, count: items.length } });
    return true;
  }
  void oaModels;
  return false;
}

/**
 * Handles a hub request for any provider. Returns false when the path isn't a hub surface (then the OpenAI double /
 * legacy routes handle it). `delegateChat(provider)` forwards an OpenAI-compatible call to the OpenAI double at
 * `/<provider>/v1/chat/completions` (so key checks, faults and rules are shared).
 */
export async function handleHub(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  raw: string,
  ctx: { run: Run; oaModels: () => string[]; delegate: (provider: string, sub: "/chat/completions" | "/models") => void },
): Promise<boolean> {
  const m = /^\/([a-z0-9-]+)(\/.*)$/.exec(url.pathname);
  if (!m || url.pathname.startsWith("/__fake") || url.pathname.startsWith("/api/")) return false;
  const provider = m[1]!;
  const sub = m[2]!;
  const known = ["openai", "anthropic", "gemini", "xai", "groq", "openrouter", "mistral", "cohere", "deepseek", "zai", "moonshot", "minimax", "dashscope", "cerebras", "together", "fireworks", "deepinfra", "huggingface", "cloudflare", "vercel-gateway"];
  if (!known.includes(provider)) return false;
  const isModels = req.method === "GET";
  const { key, auth } = keyOf(req);
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  const headers: Record<string, string> = {};
  for (const h of INTERESTING_HEADERS) if (typeof req.headers[h] === "string") headers[h] = req.headers[h] as string;
  const stream = body.stream === true || sub.endsWith(":streamGenerateContent");
  hub.requests.push({ at: new Date().toISOString(), provider, method: req.method ?? "GET", path: sub, query: Object.fromEntries(url.searchParams), auth, keySha256: key ? sha(key) : null, headers, body: isModels ? null : body, stream });
  if (hub.requests.length > 300) hub.requests.shift();
  if (url.searchParams.has("key")) return json(res, 400, { error: { message: "API keys must not be sent in the URL (test double guard)" } }), true;
  // Plain /v1/chat/completions and /v1/models (non-streamed, no quirk fault pending) keep the Wave A OpenAI double
  // exactly as it was (its own key messages, faults and pagination).
  const pending = hub.faults.some((f) => f.times > 0 && (!f.provider || f.provider === provider) && (f.path ?? "chat") === (isModels ? "models" : "chat"));
  if (/^\/v1\/(chat\/completions|models)$/.test(sub) && !pending && !stream && !OWN_MODEL_IDS.has(provider) && !(provider in NATIVE_MODELS)) return false;

  // A documented PUBLIC list answers whatever key (or none) is sent: listing it proves nothing about the key.
  if (isModels && hub.publicListing.has(provider) && listModels(provider, sub, url, res, ctx.oaModels())) return true;
  if (!key || !key.startsWith("sk-fake-") || key.includes("revoked")) return unauthorized(res, provider), true;
  // OpenRouter GET /api/v1/key: authenticated, non-billable key information (remaining credit, free-tier flag).
  if (provider === "openrouter" && sub === "/api/v1/key" && req.method === "GET") return json(res, 200, { data: { label: "fake key", usage: 0, limit: null, is_free_tier: false } }), true;
  const fault = takeFault(provider, isModels ? "models" : "chat");
  if (fault?.mode === "hang") return true; // never answer
  if (fault?.mode === "http") return json(res, fault.status ?? 500, fault.body ?? {}, fault.headers ?? {}), true;
  if (fault?.mode === "json") return json(res, 200, fault.body ?? {}), true;

  if (isModels) {
    if (listModels(provider, sub, url, res, ctx.oaModels())) return true;
    if (sub.endsWith("/models")) return ctx.delegate(provider, "/models"), true;
    return false;
  }
  const modelId = String(body.model ?? "");
  const nativeRemoved = (id: string) => hub.removed.has(`${provider}/${id}`) || hub.removed.has(id);
  if (provider === "anthropic" && sub === "/v1/messages") {
    if (!NATIVE_MODELS.anthropic!.includes(modelId) || nativeRemoved(modelId)) return json(res, 404, { type: "error", error: { type: "not_found_error", message: `model: ${modelId}` } }), true;
    return anthropic(req, body, res, ctx.run, fault), true;
  }
  const g = /^\/v1beta\/models\/([^/:]+):(generateContent|streamGenerateContent)$/.exec(sub);
  if (provider === "gemini" && g) {
    if (!NATIVE_MODELS.gemini!.includes(g[1]!) || nativeRemoved(g[1]!)) return json(res, 404, { error: { code: 404, message: `models/${g[1]} is not found`, status: "NOT_FOUND" } }), true;
    if (g[2] === "streamGenerateContent" && url.searchParams.get("alt") !== "sse") return json(res, 400, { error: { code: 400, message: "alt=sse expected by the test double", status: "INVALID_ARGUMENT" } }), true;
    return gemini(g[1]!, g[2] === "streamGenerateContent", body, res, ctx.run, fault), true;
  }
  if (provider === "cohere" && sub === "/v2/chat") {
    if (!NATIVE_MODELS.cohere!.includes(modelId) || nativeRemoved(modelId)) return json(res, 404, { message: `model '${modelId}' not found` }), true;
    return cohere(body, res, ctx.run, fault), true;
  }
  if (sub.endsWith("/responses")) {
    if (!ctx.oaModels().includes(modelId) || nativeRemoved(modelId)) return json(res, 404, { error: { message: `The model ${modelId} does not exist`, type: "invalid_request_error", code: "model_not_found" } }), true;
    return responses(provider, body, res, ctx.run, fault), true;
  }
  if (sub.endsWith("/chat/completions")) {
    if (stream || fault || OWN_MODEL_IDS.has(provider)) return chatStreamOrQuirk(provider, body, res, ctx, fault), true;
    return ctx.delegate(provider, "/chat/completions"), true;
  }
  return false;
}

/** OpenAI-compatible streaming (chat.completion.chunk + [DONE]) and in-band quirks (OpenRouter error after 200). */
async function chatStreamOrQuirk(provider: string, body: Record<string, unknown>, res: ServerResponse, ctx: { run: Run; oaModels: () => string[] }, fault: HubFault | undefined) {
  const model = String(body.model ?? "");
  if (!knownChatModel(provider, model, ctx.oaModels())) return json(res, 404, { error: { message: `The model \`${model}\` does not exist`, type: "invalid_request_error", code: "model_not_found" } });
  const msgs = (body.messages ?? []) as { role: string; content: string | null; tool_calls?: { id: string; function: { name: string } }[]; tool_call_id?: string }[];
  const names = new Map<string, string>();
  for (const x of msgs) for (const c of x.tool_calls ?? []) names.set(c.id, c.function.name);
  const system = msgs.find((x) => x.role === "system")?.content ?? "";
  const format = (body.response_format as { json_schema?: { schema?: unknown } } | undefined)?.json_schema?.schema ?? prompted(system ?? "");
  const tools = body.tools as InnerReq["tools"];
  const o = await ctx.run({
    model,
    ...(format ? { format } : {}),
    ...(tools || system.includes("You are an agent inside Flowline") ? { tools: tools ?? [] } : {}),
    messages: msgs.map((x) => ({ role: x.role, content: x.content ?? "", ...(x.role === "tool" && x.tool_call_id ? { tool_name: names.get(x.tool_call_id) } : {}), ...(x.tool_calls ? { tool_calls: x.tool_calls.map((c) => ({ function: { name: c.function.name } })) } : {}) })),
  });
  if (o.status >= 400) return json(res, 500, { error: { message: "The server had an error while processing your request.", type: "server_error" } });
  const base = { id: "chatcmpl-fake-stream", object: "chat.completion.chunk", model, ...(provider === "openrouter" ? { provider: "FakeUpstream" } : {}) };
  const usage = { prompt_tokens: o.promptTokens, completion_tokens: o.outputTokens, total_tokens: o.promptTokens + o.outputTokens, ...(provider === "openrouter" ? { cost: 0.000123 } : {}) };
  const events: { data: unknown }[] = [];
  if (o.toolCalls.length)
    o.toolCalls.forEach((c, i) => {
      const args = JSON.stringify(c.arguments);
      events.push({ data: { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${i}`, type: "function", function: { name: c.name, arguments: "" } }] } }] } });
      for (const d of chunks(args)) events.push({ data: { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: d } }] } }] } });
    });
  else for (const d of chunks(o.content)) events.push({ data: { ...base, choices: [{ index: 0, delta: { content: d, reasoning_content: "HIDDEN-CHAIN-OF-THOUGHT-CANARY" } }] } });
  events.push({ data: { ...base, choices: [{ index: 0, delta: {}, finish_reason: o.toolCalls.length ? "tool_calls" : "stop" }] } });
  events.push({ data: { ...base, choices: [], usage } }, { data: "[DONE]" });
  if (body.stream !== true) {
    // Non-streamed quirk replies (e.g. OpenRouter usage.cost + serving provider) are produced here.
    return json(res, 200, { id: "chatcmpl-fake", object: "chat.completion", model, ...(provider === "openrouter" ? { provider: "FakeUpstream" } : {}), choices: [{ index: 0, message: { role: "assistant", content: o.toolCalls.length ? null : o.content, ...(o.toolCalls.length ? { tool_calls: o.toolCalls.map((c, i) => ({ id: `call_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } : {}) }, finish_reason: o.toolCalls.length ? "tool_calls" : "stop" }], usage });
  }
  return sse(res, events, streamOpts(fault, { data: { ...base, error: { code: 502, message: "Upstream error", metadata: { error_type: "provider_error" } }, choices: [{ index: 0, delta: {}, finish_reason: "error" }] } }));
}
