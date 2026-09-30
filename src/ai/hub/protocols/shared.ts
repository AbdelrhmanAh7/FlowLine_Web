import { redactString } from "@/server/redact";
import type { ProviderDefinition } from "../registry";
import { parseRetryAfter } from "../transport";
import { HubError, type AiModelCapabilities, type HubChatRequest } from "../types";

/**
 * Helpers shared by every protocol: number/JSON parsing, request validation, an SSE parser, and the ONE place where
 * provider HTTP errors are mapped to stable HubError codes (with the per-provider quirks from the research record).
 * Provider error TEXT is never passed through (it may echo the key or the request): only a bounded error code.
 */

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/** A tool call whose arguments aren't a JSON object: corrupt (or cut) model output, possibly billed. */
export function badToolArgs(def: ProviderDefinition) {
  return new HubError("AI_BAD_RESPONSE", `${def.name} returned a tool call whose arguments aren't valid JSON`, { retryable: true, possibleCharge: true });
}

/**
 * Tool-call arguments: an object, or its JSON text. Empty text is a valid call without arguments (Anthropic streams
 * no `partial_json` for an empty input; some compatible servers send ""). Anything else — incomplete or invalid JSON,
 * an array, a number, a missing field — is rejected: it is never turned into `{}`.
 */
export function parseArgs(def: ProviderDefinition, a: unknown): Record<string, unknown> {
  let v = a;
  if (typeof v === "string") {
    if (!v.trim()) return {};
    try {
      v = JSON.parse(v);
    } catch {
      throw badToolArgs(def);
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  throw badToolArgs(def);
}

/** Structured output is sent natively only when the route SUPPORTS it; otherwise the JSON is prompted and validated. */
export function structuredOutputMode(caps: AiModelCapabilities, schema?: Record<string, unknown>): "native" | "prompted" | "none" {
  if (!schema) return "none";
  return caps.structuredOutput === "SUPPORTED" ? "native" : "prompted";
}

/** Parameter checks shared by all protocols: unsupported parameters are rejected, never silently dropped. */
export function validateRequest(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, stream = false) {
  if (req.tools?.length && caps.tools === "UNSUPPORTED") throw new HubError("AI_CAPABILITY_UNSUPPORTED", `${model} doesn't support tool calls on ${def.name}`);
  if (stream && caps.streaming === "UNSUPPORTED") throw new HubError("AI_CAPABILITY_UNSUPPORTED", `${model} doesn't support streaming on ${def.name}`);
  if (!Number.isInteger(req.maxTokens) || req.maxTokens < 1) throw new HubError("AI_BAD_REQUEST", "maxTokens must be a positive integer");
  if (req.temperature !== undefined && (req.temperature < 0 || req.temperature > 2)) throw new HubError("AI_BAD_REQUEST", "temperature must be between 0 and 2");
  for (const t of req.tools ?? []) if (!/^[A-Za-z0-9_-]{1,64}$/.test(t.name)) throw new HubError("AI_BAD_REQUEST", `Tool name "${t.name.slice(0, 40)}" is not valid`);
}

/** Provider error text is untrusted and may echo parts of the key: scrub it and cap its length. */
export function scrubProviderMessage(msg: unknown, apiKey: string): string {
  if (typeof msg !== "string") return "";
  const masked = redactString(msg, apiKey ? [apiKey] : []).replace(/\b(sk|key|api)[-_][A-Za-z0-9_*.\-]{3,}/gi, "[REDACTED_API_KEY]");
  return masked.slice(0, 300);
}

/* ───────────── SSE ───────────── */

export interface SseEvent {
  event: string | null;
  data: string;
}

/**
 * Incremental Server-Sent-Events parser (text/event-stream): handles chunk boundaries anywhere, CRLF, comments
 * (keep-alives such as DeepSeek's), multi-line data. `onEvent` may throw (e.g. a mid-stream provider error): the
 * exception propagates out of `push`, which stops the read.
 */
export function createSseParser(onEvent: (e: SseEvent) => void) {
  const decoder = new TextDecoder();
  let buf = "";
  let event: string | null = null;
  let data: string[] = [];
  const dispatch = () => {
    if (data.length) onEvent({ event, data: data.join("\n") });
    event = null;
    data = [];
  };
  const line = (l: string) => {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return; // comment / keep-alive
    const i = l.indexOf(":");
    const field = i === -1 ? l : l.slice(0, i);
    const value = i === -1 ? "" : l.slice(i + 1).replace(/^ /, "");
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
  };
  return {
    push(chunk: Uint8Array) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.search(/\r\n|\r|\n/)) !== -1) {
        // A CR at the very end may be the first half of a CRLF split across chunks: wait for the next byte.
        if (buf[nl] === "\r" && nl === buf.length - 1) break;
        const sep = buf[nl] === "\r" && buf[nl + 1] === "\n" ? 2 : 1;
        line(buf.slice(0, nl));
        buf = buf.slice(nl + sep);
      }
    },
    end() {
      buf += decoder.decode();
      if (buf) line(buf);
      buf = "";
      dispatch();
    },
  };
}

/**
 * One SSE `data:` payload as a JSON object. An empty payload is a keep-alive (null: ignored); comments never reach
 * here (the parser drops them). Anything else that isn't a JSON object is a malformed protocol chunk: the attempt
 * fails rather than returning an answer with a silently missing piece. `[DONE]` is handled by the callers that
 * document it before calling this.
 */
export function streamJson(def: ProviderDefinition, data: string): Record<string, unknown> | null {
  if (!data.trim()) return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    throw malformedChunk(def);
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw malformedChunk(def);
  return v as Record<string, unknown>;
}

function malformedChunk(def: ProviderDefinition) {
  return new HubError("AI_BAD_RESPONSE", `${def.name} sent a malformed stream chunk; the partial answer was discarded`, { retryable: true, possibleCharge: true });
}

/* ───────────── errors ───────────── */

/** Lower-cased identifiers found in any documented error body shape (OpenAI, Anthropic, Google, Z.ai, MiniMax, Alibaba…). */
export function errorTokens(body: unknown): { tokens: Set<string>; message: string } {
  const tokens = new Set<string>();
  let message = "";
  const add = (v: unknown) => {
    if (typeof v === "string" && v && v.length <= 80) tokens.add(v.toLowerCase());
    else if (typeof v === "number" && Number.isFinite(v)) tokens.add(String(v));
  };
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const e = (b.error && typeof b.error === "object" ? b.error : {}) as Record<string, unknown>;
  for (const v of [e.code, e.type, e.status, b.code, b.type]) add(v);
  const details = e.details;
  if (details && typeof details === "object" && !Array.isArray(details)) add((details as { error_code?: unknown }).error_code);
  if (Array.isArray(details)) for (const d of details) if (d && typeof d === "object") add((d as { reason?: unknown }).reason);
  const meta = e.metadata as { error_type?: unknown } | undefined;
  if (meta && typeof meta === "object") add(meta.error_type);
  const base = b.base_resp as { status_code?: unknown } | undefined;
  if (base && typeof base === "object") add(base.status_code);
  for (const m of [e.message, b.message, (base as { status_msg?: unknown } | undefined)?.status_msg]) if (typeof m === "string" && !message) message = m;
  return { tokens, message };
}

const QUOTA_TOKENS = [
  "insufficient_quota", // OpenAI: quota exhausted (vs rate limit)
  "exceeded_current_quota_error", // Moonshot/Kimi: insufficient balance (429)
  "arrearage", // Alibaba: account overdue (400)
  "budgetlimitexceeded", // Alibaba: budget limit (429)
  "allocationquota.freetieronly", // Alibaba: free quota exhausted in free-only mode (403)
  "quota_for_entity_exceeded", // Vercel: budget hit (402)
  "enforced_spend_limit_reached", // Anthropic: tier spend cap (429 without retry-after)
  "billing_error", // Anthropic 402
  "payment_required", // Gemini 402 (prepay depleted)
  "quota_exceeded", // Gemini daily quota (429)
];
/** Z.ai business codes: 1113 balance, 1308/1310 usage/quota limits. MiniMax base_resp 1008 balance. */
const QUOTA_CODES: Record<string, string[]> = { zai: ["1113", "1308", "1310"], minimax: ["1008"] };
const PLAN_CODES: Record<string, string[]> = { zai: ["1309", "1315"] };
const AUTH_CODES: Record<string, string[]> = { zai: ["1000", "1001", "1002", "1003", "1004", "1005"], minimax: ["1004", "2049"] };
const MODEL_CODES: Record<string, string[]> = { zai: ["1211"] };
const RATE_CODES: Record<string, string[]> = { zai: ["1302", "1305"], minimax: ["1002"] };
const SAFETY_TOKENS = ["content_filter", "datainspectionfailed"];

function has(tokens: Set<string>, list: string[] | undefined) {
  return (list ?? []).some((t) => tokens.has(t));
}

/**
 * The ONLY provider error identifiers that may appear in a message: the documented ones this mapper recognises
 * (fixed vocabulary). Anything else a provider sends in `code` / `type` / `status` — possibly an echoed secret or
 * request content — is dropped (CXH-16).
 */
const KNOWN_ERROR_IDS = new Set<string>([
  ...QUOTA_TOKENS,
  ...SAFETY_TOKENS,
  ...[QUOTA_CODES, PLAN_CODES, AUTH_CODES, MODEL_CODES, RATE_CODES].flatMap((m) => Object.values(m).flat()),
  "1313",
  "invalidapikey",
  "invalid_api_key",
  "invalid_authentication_error",
  "incorrect_api_key_error",
  "authentication_error",
  "permission_error",
  "customer_verification_required",
  "accessdenied.unpurchased",
  "model_not_found",
  "modelnotfound",
  "resource_not_found_error",
  "not_found_error",
  "not_found",
  "overloaded_error",
  "engine_overloaded_error",
  "rate_limit_exceeded",
  "rate_limit_error",
  "rate_limit_reached_error",
  "throttling.allocationquota",
  "failed_precondition",
  "invalid_request_error",
  "invalid_argument",
  "context_length_exceeded",
  "request_too_large",
]);

/** Gemini block reasons + finish reasons that mean a safety refusal (documented values, lower-cased). */
const SAFETY_REASONS = new Set(["content_filter", "refusal", "safety", "blocklist", "prohibited_content", "spii", "recitation", "image_safety", "other", "blocked"]);

/**
 * Maps a provider error (HTTP status + body) to a stable, actionable HubError. Rules from the research record:
 * - "out of balance" is NOT a retryable 429: DeepSeek 402, Z.ai 429/1113, Kimi 429 exceeded_current_quota_error,
 *   MiniMax base_resp 1008, Alibaba 400 Arrearage, Anthropic spend-cap 429 without retry-after, OpenAI
 *   insufficient_quota → AI_QUOTA_EXCEEDED (never retried, never a silent fallback to a paid route of the same key).
 * - Anthropic 529 and Groq 498 are "overloaded" (retryable); Groq/Cohere 499 = request cancelled (not retried).
 * - Coding-plan keys (Z.ai 1309/1315) → AI_PLAN_NOT_ALLOWED; Cohere trial-key limit → AI_TRIAL_KEY.
 * - Moderation blocks (Kimi content_filter, Alibaba DataInspectionFailed, OpenRouter 403) → AI_SAFETY_REFUSAL (no fallback).
 * - Together 403 = input + max_tokens over the context length (not a permission problem).
 */
export function mapProviderError(def: ProviderDefinition, model: string, status: number, headers: Headers | null, body: unknown): HubError {
  const { tokens, message } = errorTokens(body);
  const opts = { httpStatus: status };
  const retryAfterRaw = headers?.get("retry-after") ?? null;
  const retryAfterMs = parseRetryAfter(retryAfterRaw);
  const p = def.id;
  const safe = [...tokens].find((t) => KNOWN_ERROR_IDS.has(t));
  const safeCode = safe ? ` [${safe}]` : "";

  if (has(tokens, PLAN_CODES[p])) return new HubError("AI_PLAN_NOT_ALLOWED", `${def.name} says this key belongs to a coding plan (${safe}). Coding-plan keys can't be used for automations — connect a pay-as-you-go API key.`, opts);
  if (status === 402 || has(tokens, QUOTA_TOKENS) || has(tokens, QUOTA_CODES[p]))
    return new HubError("AI_QUOTA_EXCEEDED", `${def.name} says this account has no balance or quota left (${status}${safeCode}). Check the provider's billing; the call was not retried.`, opts);
  // Anthropic: the tier spend-cap 429 carries no retry-after (a rate-limit 429 does).
  if (p === "anthropic" && status === 429 && retryAfterRaw == null) return new HubError("AI_QUOTA_EXCEEDED", `${def.name} reports a spend limit (429 without retry-after). Raise the limit in the Claude Console; the call was not retried.`, opts);
  if (p === "cohere" && status === 429 && /trial key/i.test(message)) return new HubError("AI_TRIAL_KEY", `${def.name} rejected a Trial key (rate limit). Trial keys are not permitted for production or commercial use — connect a production key.`, opts);
  if (has(tokens, SAFETY_TOKENS) || (p === "openrouter" && status === 403)) return new HubError("AI_SAFETY_REFUSAL", `${def.name} blocked this request with its content moderation (${status}${safeCode}). Nothing was retried or sent elsewhere.`, opts);
  if (status === 401 || has(tokens, AUTH_CODES[p]) || tokens.has("invalidapikey") || tokens.has("invalid_authentication_error") || tokens.has("incorrect_api_key_error") || tokens.has("authentication_error"))
    return new HubError("AI_AUTH_FAILED", `${def.name} rejected the API key (${status}). Rotate the key in Settings → AI Providers.`, opts);
  if (status === 403) {
    if (p === "together") return new HubError("AI_CONTEXT_TOO_LONG", `${def.name} says the input plus max tokens is over ${model}'s context length (403). Shorten the input or lower max tokens.`, opts);
    if (tokens.has("customer_verification_required")) return new HubError("AI_ACCOUNT_ACTION_REQUIRED", `${def.name} needs a payment method on the account before it can be used (403 customer_verification_required).`, opts);
    if (/country, region, or territory not supported/i.test(message)) return new HubError("AI_REGION_UNSUPPORTED", `${def.name} doesn't serve requests from this region (403). Requests come from Flowline's servers.`, opts);
    if (tokens.has("accessdenied.unpurchased")) return new HubError("AI_FORBIDDEN", `${def.name}: the service isn't activated for this account (403 AccessDenied.Unpurchased).`, opts);
    return new HubError("AI_FORBIDDEN", `${def.name} refused access (403): this key may not be allowed to use ${model}.`, opts);
  }
  if (status === 404 || has(tokens, MODEL_CODES[p]) || tokens.has("model_not_found") || tokens.has("modelnotfound") || tokens.has("resource_not_found_error") || tokens.has("not_found_error") || tokens.has("not_found"))
    return new HubError("AI_MODEL_REMOVED", `${model} isn't available on this ${def.name} connection anymore (${status}). Pick another model, or refresh the model list.`, opts);
  if (status === 413) return new HubError("AI_REQUEST_TOO_LARGE", `${def.name} says the request is too large (413).`, opts);
  if (status === 499) return new HubError("AI_CANCELLED", `${def.name} reports the request was cancelled (499).`, opts);
  if (p === "zai" && tokens.has("1313")) return new HubError("AI_FORBIDDEN", `${def.name} reports a fair-use violation (1313); the call was not retried.`, opts);
  if (status === 529 || status === 498 || tokens.has("overloaded_error") || tokens.has("engine_overloaded_error") || (p === "zai" && tokens.has("1305")))
    return new HubError("AI_OVERLOADED", `${def.name} is overloaded (${status})`, { ...opts, retryable: true, retryAfterMs });
  if (status === 429 || has(tokens, RATE_CODES[p]) || tokens.has("rate_limit_exceeded") || tokens.has("rate_limit_error") || tokens.has("rate_limit_reached_error") || tokens.has("throttling.allocationquota"))
    return new HubError("AI_RATE_LIMITED", `${def.name} rate-limited the request (${status})`, { ...opts, retryable: true, retryAfterMs });
  if (status === 408 || status === 504 || status === 524) return new HubError("AI_TIMEOUT", `${def.name} timed out (${status})`, { ...opts, retryable: true, possibleCharge: true });
  if (tokens.has("failed_precondition")) return new HubError("AI_ACCOUNT_ACTION_REQUIRED", `${def.name} refused the call because of an account precondition (e.g. billing disabled) (${status}).`, opts);
  if (p === "openrouter" && status === 503) return new HubError("AI_ROUTING_UNAVAILABLE", `${def.name} has no upstream provider that meets this request's routing requirements (503).`, opts);
  if (status >= 500) return new HubError("AI_PROVIDER_ERROR", `${def.name} had a server error (${status})`, { ...opts, retryable: true, retryAfterMs });
  return new HubError("AI_BAD_REQUEST", `${def.name} rejected the request (${status})${safeCode}. Check the step settings (model, output schema, max tokens).`, opts);
}

/** An error delivered inside a 200 response or mid-stream (OpenRouter chunk, Anthropic `error` event, MiniMax base_resp). */
export function mapInBandError(def: ProviderDefinition, model: string, body: unknown): HubError {
  const e = ((body as { error?: unknown })?.error ?? {}) as { code?: unknown; type?: unknown };
  const status = typeof e.code === "number" && e.code >= 400 && e.code < 600 ? e.code : e.type === "overloaded_error" ? 529 : 502;
  const err = mapProviderError(def, model, status, null, body);
  err.possibleCharge = true;
  return err;
}

/** Finish reasons that mean the provider's safety system refused (only an error when nothing usable came back). */
export const SAFETY_FINISH = new Set(["content_filter", "refusal", "safety", "blocklist", "prohibited_content", "spii", "recitation"]);

export function safetyRefusal(def: ProviderDefinition, reason: string | null) {
  // Only a documented reason is named; free text from the provider is never copied into the error.
  const r = (reason ?? "").toLowerCase();
  return new HubError("AI_SAFETY_REFUSAL", `${def.name} refused to answer (${SAFETY_REASONS.has(r) ? r : "blocked"}). Nothing was retried or sent elsewhere.`);
}

/**
 * Defence in depth (CXH-16): whatever a provider call raises, the credential that was submitted with it never
 * travels further in the error (returned to the UI, stored as last_error, written to run meta or logs).
 */
export function scrubHubError<E>(e: E, apiKey: string): E {
  if (e instanceof HubError && apiKey) {
    const clean = redactString(e.message, [apiKey]).replace(/\b(sk|key|api)[-_][A-Za-z0-9_*.\-]{3,}/gi, "[REDACTED_API_KEY]");
    if (clean !== e.message) e.message = clean;
  }
  return e;
}

/** Response bodies that aren't JSON. */
export function parseBody(def: ProviderDefinition, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a response that isn't JSON`, { retryable: true, possibleCharge: true });
  }
}

export function errorBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Safe model id in a URL path segment (Gemini puts the model id in the path). */
export function pathModel(def: ProviderDefinition, model: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(model)) throw new HubError("AI_BAD_REQUEST", `"${model.slice(0, 60)}" isn't a valid ${def.name} model id`);
  return model;
}
