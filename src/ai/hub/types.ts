import { NodeError } from "@/engine/execute";
import type { AiModelCapabilities, AiModelPricing, CapabilityState } from "@/db/schema";
import type { Protocol } from "./registry";

export type { AiModelCapabilities, AiModelPricing, CapabilityState };

/** Hub error: a NodeError (so workflow steps fail with a stable code) plus retry hints. Messages never carry secrets. */
export class HubError extends NodeError {
  retryable: boolean;
  retryAfterMs?: number;
  httpStatus?: number;
  /** The provider may have billed this attempt (timeout after the request was sent, stream cut after a 200). */
  possibleCharge?: boolean;
  constructor(code: string, message: string, opts: { retryable?: boolean; retryAfterMs?: number; httpStatus?: number; possibleCharge?: boolean } = {}) {
    super(code, message);
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
    this.httpStatus = opts.httpStatus;
    this.possibleCharge = opts.possibleCharge;
  }
}

export interface HubToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface HubToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type HubMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: HubToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface HubChatRequest {
  system: string;
  messages: HubMessage[];
  tools?: HubToolDef[];
  /** JSON Schema for the answer. Sent natively only when the route SUPPORTS structured output. */
  schema?: Record<string, unknown>;
  maxTokens: number;
  temperature?: number;
}

/** Non-overlapping token counts (see ai_attempt). null = the provider did not report it. */
export interface NormalisedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
}

export interface NormalisedResult {
  text: string;
  toolCalls: HubToolCall[];
  finishReason: string | null;
  model: string;
  usage: NormalisedUsage;
  /** Cost reported by the provider itself, in micro-USD (e.g. a gateway's usage.cost). */
  providerCostMicros?: number;
  /** For gateways: the upstream provider that actually served the request, when the gateway reports it. */
  servingProvider?: string | null;
  /** false = the provider reported no usage (e.g. a stream without a usage chunk): tokens and cost are UNKNOWN. */
  usageReported?: boolean;
}

/** Streaming events delivered to a caller while a call is in flight (text only; reasoning text is never forwarded). */
export type StreamEvent =
  | { type: "delta"; attemptKey: string; text: string }
  /** The attempt that produced the earlier deltas failed: everything it streamed must be dropped (never concatenated). */
  | { type: "discard"; attemptKey: string; reason: string };

/** Listing metadata that some providers return with their model list (never invented: absent = unknown). */
export interface DiscoveredModel {
  id: string;
  ownedBy: string | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  capabilities?: Partial<AiModelCapabilities>;
  /** Per-token USD prices converted to micro-USD per million tokens, only when the listing documents the unit. */
  pricing?: AiModelPricing | null;
  deprecated?: boolean;
}

/** A resolved route: everything needed to call a model, minus the secret. Snapshotted into run meta. */
export interface ResolvedRoute {
  kind: "workspace";
  provider: string;
  connectionId: string;
  connectionLabel: string;
  modelId: string;
  protocol: Protocol;
  /** Where the choice came from: explicit → node pin → workspace default (or a policy step). */
  source: "explicit" | "node" | "agent" | "copilot" | "legacy-node-model" | "workspace-default" | "policy";
  capabilities: AiModelCapabilities;
  pricing: (AiModelPricing & { source: string }) | null;
  /** Free-tier classification of the price (FREE_ONLY only accepts verified zero-priced routes). */
  free?: { zeroPriced: boolean; note: string | null };
  /**
   * Set when the model can't be used on this connection (removed from / absent from its listing) and the caller asked
   * the planner to decide (CXH-13): FALLBACK / FREE_ONLY / LOW_COST skip it and try their listed routes; MANUAL refuses.
   */
  unavailable?: { code: "AI_MODEL_REMOVED" | "AI_MODEL_NOT_LISTED"; message: string };
}

export const UNKNOWN_CAPABILITIES: AiModelCapabilities = { tools: "UNKNOWN", structuredOutput: "UNKNOWN", vision: "UNKNOWN", streaming: "UNKNOWN", reasoning: "UNKNOWN" };
