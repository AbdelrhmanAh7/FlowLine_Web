import { randomBytes } from "node:crypto";
import { expect } from "vitest";
import { startFakeProviders } from "../../e2e/fakes/provider-server";
import { createProviderHttp } from "@/integrations/http";
import { getAction, getProvider } from "@/integrations/registry";
import { ProviderError, type ActionContext, type Credentials, type ProviderDef } from "@/integrations/types";

export interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: unknown;
  time: string;
}

export interface Fake {
  url: string;
  port: number;
  close(): Promise<void>;
  requests(provider: string): Promise<RecordedRequest[]>;
  lastRequest(provider: string): Promise<RecordedRequest>;
  state<T = unknown>(provider: string): Promise<T>;
  reset(): Promise<void>;
  fault(f: { provider: string; pathPattern: string; mode: "429" | "500" | "500_after_commit" | "timeout" | "drop_after_commit" | "drop_before_commit" | "delay"; times?: number; retryAfterSec?: number; delayMs?: number }): Promise<void>;
  /** Registers a client the provider accepts (this id + one of these secrets); an empty list removes that client. Once any client is registered, unknown clients get invalid_client. */
  oauthClient(provider: string, clientId: string, secrets: string[]): Promise<void>;
  /** Forces the provider's next token response(s) to be an OAuth error with this description. */
  oauthError(provider: string, error: string, description: string, times?: number): Promise<void>;
}

/** Starts the fake provider server on an ephemeral port and points the test env at it. */
export async function startFake(): Promise<Fake> {
  const server = await startFakeProviders();
  process.env.FLOWLINE_ENV = "test";
  process.env.FLOWLINE_PROVIDER_OVERRIDE = server.url;
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${server.port},localhost:${server.port}`;

  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${server.url}${path}`, init);
    return (await res.json()) as T;
  };

  const requests = async (p: string): Promise<RecordedRequest[]> => {
    const { requests: rs } = await call<{ requests: RecordedRequest[] }>(`/__fake/requests?provider=${p}`);
    return rs;
  };

  return {
    url: server.url,
    port: server.port,
    close: server.close,
    requests,
    async lastRequest(p) {
      const rs = await requests(p);
      const last = rs[rs.length - 1];
      if (!last) throw new Error(`No requests recorded for ${p}`);
      return last;
    },
    state: (provider) => call(`/__fake/state/${provider}`),
    reset: () => call("/__fake/reset", { method: "POST" }),
    fault: (f) =>
      call("/__fake/fault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      }),
    oauthClient: (provider, clientId, secrets) => call("/__fake/oauth-client", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, clientId, secrets }) }),
    oauthError: (provider, error, description, times = 1) => call("/__fake/oauth-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, error, description, times }) }),
  };
}

export function provider(id: string): ProviderDef {
  const p = getProvider(id);
  if (!p) throw new Error(`Provider ${id} is not registered`);
  return p;
}

export interface CtxOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function makeCtx(p: ProviderDef, creds: Credentials, opts: CtxOptions = {}): ActionContext {
  const signal = opts.signal ?? new AbortController().signal;
  return {
    http: createProviderHttp(p, creds, signal),
    credentials: creds,
    idempotencyKey: opts.idempotencyKey ?? `idem-${randomBytes(6).toString("hex")}`,
    signal,
    log: () => {},
  };
}

/** Runs an action end-to-end: input parsed by its zod schema, output validated against its schema. */
export async function runAction<O = unknown>(actionId: string, ctx: ActionContext, input: unknown): Promise<O> {
  const found = getAction(actionId);
  if (!found) throw new Error(`Action ${actionId} is not registered`);
  const parsed = found.action.input.parse(input);
  const out = await found.action.run(ctx, parsed);
  return found.action.output.parse(out) as O;
}

export async function runVerify<O = unknown>(actionId: string, ctx: ActionContext, input: unknown): Promise<{ happened: boolean; output?: O }> {
  const found = getAction(actionId);
  if (!found?.action.verify) throw new Error(`Action ${actionId} has no verify`);
  const parsed = found.action.input.parse(input);
  return found.action.verify(ctx, parsed) as Promise<{ happened: boolean; output?: O }>;
}

export async function expectProviderError(promise: Promise<unknown>, kind: string): Promise<ProviderError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError);
    expect((e as ProviderError).kind).toBe(kind);
    return e as ProviderError;
  }
  throw new Error(`Expected a ProviderError of kind "${kind}" but the call succeeded`);
}

export const oauthCreds: Credentials = { type: "oauth2", token: "test-token" };
export const apiKeyCreds: Credentials = { type: "api_key", token: "test-token" };
export const stripeCreds: Credentials = { type: "api_key", token: "sk_test_fake" };
export const zendeskCreds: Credentials = {
  type: "basic",
  username: "agent@flowline.test/token",
  password: "test-token",
  settings: { subdomain: "acme" },
};
export const snowflakeCreds: Credentials = {
  type: "api_key",
  token: "test-token",
  settings: { accountUrl: "https://xy12345.snowflakecomputing.com" },
};

export function queryOf(r: RecordedRequest): URLSearchParams {
  return new URLSearchParams(r.query);
}
