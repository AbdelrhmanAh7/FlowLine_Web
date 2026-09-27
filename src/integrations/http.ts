import { EgressError, safeFetch } from "@/server/egress";
import { ProviderError, type Credentials, type HttpRequest, type HttpResponse, type ProviderDef, type ProviderHttp } from "./types";

/**
 * Base URL for a provider. Only in the test environment can FLOWLINE_PROVIDER_OVERRIDE
 * redirect providers to the local fake provider server (still subject to the egress
 * allowlist). Production always uses the provider's real apiBase.
 */
export function resolveBase(provider: ProviderDef, override?: string): string {
  if (process.env.FLOWLINE_ENV === "test" && process.env.FLOWLINE_PROVIDER_OVERRIDE) {
    return `${process.env.FLOWLINE_PROVIDER_OVERRIDE.replace(/\/$/, "")}/${provider.id}`;
  }
  return (override ?? provider.apiBase).replace(/\/$/, "");
}

function authHeaders(provider: ProviderDef, creds: Credentials): Record<string, string> {
  if (creds.type === "basic" && creds.username) {
    return { authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password ?? ""}`).toString("base64")}` };
  }
  if (creds.token) {
    // Notion/Linear/etc. all accept Bearer; providers needing a different header set it per request.
    return { authorization: `Bearer ${creds.token}` };
  }
  return {};
}

export function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const s = Number(h);
  if (Number.isFinite(s)) return Math.min(s * 1000, 60_000);
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(0, Math.min(t - Date.now(), 60_000)) : undefined;
}

export function createProviderHttp(provider: ProviderDef, creds: Credentials, signal: AbortSignal): ProviderHttp {
  return {
    async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
      const base = resolveBase(provider, req.baseUrl);
      const url = new URL(base + req.path);
      for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
      const headers: Record<string, string> = { accept: "application/json", ...authHeaders(provider, creds), ...req.headers };
      let body: string | undefined = req.body;
      if (req.json !== undefined) {
        body = JSON.stringify(req.json);
        headers["content-type"] ??= "application/json";
      }
      let sent = false;
      let res;
      try {
        // A connection error before any byte was written means the request was NOT sent.
        res = await safeFetch(url.toString(), { method: req.method, headers, body, timeoutMs: req.timeoutMs ?? 20_000, signal });
        sent = true;
      } catch (e) {
        if (e instanceof EgressError) throw new ProviderError("egress_blocked", e.message);
        if (signal.aborted && signal.reason?.name !== "TimeoutError") throw e; // cancelled by the user
        const name = (e as Error).name;
        const code = (e as { cause?: { code?: string } }).cause?.code ?? "";
        if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("timeout", `${provider.name} did not respond in time`);
        if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET_BEFORE_WRITE"].includes(code)) {
          throw new ProviderError("network", `Could not reach ${provider.name} (${code})`);
        }
        // Socket closed after the request was written: the provider may have applied it.
        throw new ProviderError("response_lost", `Lost the response from ${provider.name}${code ? ` (${code})` : ""}`);
      }
      void sent;
      const text = res.text();
      let data: unknown = text;
      if (text && (res.headers.get("content-type") ?? "").includes("json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (res.status >= 200 && res.status < 300) return { status: res.status, headers: res.headers, data: data as T };
      const msg = extractMessage(data) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth", `${provider.name}: ${msg}`, res.status);
      if (res.status === 404) throw new ProviderError("not_found", `${provider.name}: ${msg}`, res.status);
      if (res.status === 429) throw new ProviderError("rate_limit", `${provider.name} rate limit: ${msg}`, 429, parseRetryAfter(res.headers.get("retry-after")));
      if (res.status >= 500) throw new ProviderError("server", `${provider.name} error ${res.status}: ${msg}`, res.status, parseRetryAfter(res.headers.get("retry-after")));
      throw new ProviderError("client", `${provider.name}: ${msg}`, res.status);
    },
  };
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return typeof data === "string" && data.length < 300 ? data : undefined;
  const d = data as Record<string, unknown>;
  const e = d.error as Record<string, unknown> | string | undefined;
  const candidate = (typeof e === "string" ? e : e?.message) ?? d.message ?? d.error_description ?? (Array.isArray(d.errors) ? (d.errors[0] as { message?: string })?.message : undefined);
  return typeof candidate === "string" ? candidate.slice(0, 300) : undefined;
}
