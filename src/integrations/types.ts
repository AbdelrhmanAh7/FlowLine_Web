import type { z } from "zod";

export const PROVIDER_IDS = [
  "google_sheets",
  "gmail",
  "slack",
  "hubspot",
  "zendesk",
  "airtable",
  "snowflake",
  "github",
  "stripe",
  "notion",
  "postgres",
  "linear",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * none           — read-only; safe to retry.
 * idempotent     — repeating it has no additional effect (upsert, set field, Stripe with Idempotency-Key).
 * non_idempotent — repeating it would duplicate an external effect (append row, send message).
 *                  A lost response is NEVER blindly retried: the engine calls `verify` or asks for review.
 */
export type SideEffect = "none" | "idempotent" | "non_idempotent";

export type AuthType = "oauth2" | "api_key" | "basic" | "connection_string";

/** Decrypted credential material. Never log, return to clients, or put in step payloads. */
export interface Credentials {
  type: AuthType;
  /** OAuth access token / API key / bearer token. */
  token?: string;
  username?: string;
  password?: string;
  /** e.g. Postgres connection string, Snowflake account URL, Zendesk subdomain. */
  connectionString?: string;
  /** Provider-specific non-secret settings captured at connect time (subdomain, account locator…). */
  settings?: Record<string, string>;
}

export type ProviderErrorKind =
  | "auth" // 401/403, revoked or expired token → connection needs attention
  | "rate_limit" // 429
  | "server" // 5xx
  | "timeout" // no response before the deadline (request may or may not have been processed)
  | "network" // connection could not be established (request NOT sent)
  | "response_lost" // request was sent but the response never arrived — outcome unknown
  | "client" // other 4xx, invalid input
  | "not_found"
  | "egress_blocked";

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public status?: number,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
  get retryable() {
    return this.kind === "rate_limit" || this.kind === "server" || this.kind === "network";
  }
  /** The request may have been applied remotely; non-idempotent actions need verification. */
  get outcomeUnknown() {
    return this.kind === "timeout" || this.kind === "response_lost";
  }
}

export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path appended to the provider base URL, e.g. "/v4/spreadsheets/abc/values/A1:append". */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** JSON body (serialized by the client) or raw string/form body. */
  json?: unknown;
  body?: string;
  /** Override base URL (e.g. Zendesk per-subdomain, Snowflake per-account). Must still pass egress checks. */
  baseUrl?: string;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
}

export interface ProviderHttp {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}

export interface ActionContext {
  http: ProviderHttp;
  credentials: Credentials;
  /** Stable for a (run, node) across retries — pass to providers that support idempotency keys. */
  idempotencyKey: string;
  signal: AbortSignal;
  /** Redacted diagnostic log attached to the step. */
  log: (message: string) => void;
}

export interface ActionDef<I = unknown, O = unknown> {
  /** Globally unique, versioned by `version`. e.g. "google_sheets.append_row". */
  id: string;
  version: number;
  provider: ProviderId;
  title: string;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  sideEffect: SideEffect;
  /** Scopes (or permission names) the connection must grant. */
  requiredScopes: string[];
  /** Requires human approval before execution by default (sending email, refunds, SQL writes…). */
  sensitive?: boolean;
  run(ctx: ActionContext, input: I): Promise<O>;
  /**
   * For non_idempotent actions: after a lost response, check whether the effect happened
   * (e.g. search for the idempotency marker). Omit when the provider offers no way to check;
   * the engine then asks a human to review instead of retrying.
   */
  verify?(ctx: ActionContext, input: I): Promise<{ happened: boolean; output?: O }>;
}

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  pkce: boolean;
  /** Extra authorize params, e.g. access_type=offline for Google. */
  extraParams?: Record<string, string>;
  clientIdEnv: string;
  clientSecretEnv: string;
}

export interface ConnectField {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  help?: string;
}

export interface ProviderDef {
  id: ProviderId;
  name: string;
  icon: string;
  category: string;
  description: string;
  authType: AuthType;
  /** Real production API base URL. Tests redirect it to the fake provider only when FLOWLINE_ENV=test. */
  apiBase: string;
  oauth?: OAuthConfig;
  /** Fields the user fills in to connect when authType is not oauth2 (API key, subdomain, connection string…). */
  connectFields?: ConnectField[];
  /** Returns the external account identity. Used on connect and to ensure reconnect uses the SAME account. */
  identity(ctx: Omit<ActionContext, "idempotencyKey">): Promise<{ accountId: string; label: string }>;
  actions: ActionDef<any, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Honest verification level, surfaced in the catalog. */
  verification: { adapter: true; contractTested: boolean; live: "verified" | "blocked" | "not_run"; liveNote?: string };
}
