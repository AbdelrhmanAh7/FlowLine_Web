import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

/**
 * Egress / SSRF protection for every outbound request made on behalf of a user
 * (HTTP node, provider adapters, file URLs, database hosts).
 *
 * - Only http(s). Plain http only for explicitly allowlisted host:port pairs.
 * - Every resolved address must be public unicast. Validation happens inside the
 *   socket's DNS lookup, so the address that is checked is the address that is
 *   connected to (no DNS-rebinding window).
 * - Redirects are followed manually (max 5) and each hop is re-validated.
 * - Response bodies are size-capped; requests time out.
 * - The only exception mechanism is FLOWLINE_EGRESS_ALLOWLIST: exact "host:port"
 *   entries (e.g. a local test provider or a dedicated database), never ranges.
 */

export class EgressError extends Error {
  constructor(
    public code: "EGRESS_BLOCKED" | "EGRESS_INVALID_URL" | "EGRESS_TOO_LARGE" | "EGRESS_TOO_MANY_REDIRECTS",
    message: string,
  ) {
    super(message);
  }
}

const BLOCKED_RANGES = new Set([
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal", // includes 169.254.169.254 cloud metadata
  "loopback",
  "private",
  "uniqueLocal", // includes fd00:ec2::254
  "carrierGradeNat",
  "reserved",
  "benchmarking",
  "amt",
  "as112",
  "deprecated",
  "orchid2",
  "droneRemoteIdProtocolEntityTags",
  "ipv4Mapped",
  "rfc6145",
  "rfc6052",
  "6to4",
  "teredo",
  "discard",
]);

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
  const range = ip.range();
  return !BLOCKED_RANGES.has(range);
}

export function allowlist(): Set<string> {
  return new Set(
    (process.env.FLOWLINE_EGRESS_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-z0-9.-]+:\d{1,5}$/.test(s)),
  );
}

function defaultPort(u: URL) {
  return u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
}

export function isAllowlisted(host: string, port: number) {
  return allowlist().has(`${host.toLowerCase()}:${port}`);
}

/** Validates scheme/host/port before any connection. Throws EgressError. */
export function checkUrl(raw: string | URL): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new EgressError("EGRESS_INVALID_URL", "Not a valid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new EgressError("EGRESS_BLOCKED", `Protocol ${u.protocol} is not allowed`);
  if (u.username || u.password) throw new EgressError("EGRESS_BLOCKED", "Credentials in URLs are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const port = defaultPort(u);
  const listed = isAllowlisted(host, port);
  if (u.protocol === "http:" && !listed) throw new EgressError("EGRESS_BLOCKED", "Plain http is only allowed for allowlisted hosts; use https");
  if (isIP(host) && !listed && !isPublicAddress(host)) throw new EgressError("EGRESS_BLOCKED", `Address ${host} is private or reserved`);
  if (!listed && (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))) {
    throw new EgressError("EGRESS_BLOCKED", `Host ${host} is internal`);
  }
  return u;
}

/** Resolves a host and asserts every address is public (or the host:port is allowlisted). For non-HTTP egress (databases). */
export async function assertHostAllowed(host: string, port: number): Promise<void> {
  await resolveAllowedAddress(host, port);
}

/**
 * Validates host:port and returns the exact IP to connect to. Non-HTTP clients (e.g. Postgres)
 * must connect to THIS address — resolving the name again would reopen a DNS-rebinding window.
 */
export async function resolveAllowedAddress(host: string, port: number): Promise<string> {
  if (!host) throw new EgressError("EGRESS_BLOCKED", "A host name is required");
  const listed = isAllowlisted(host, port);
  if (isIP(host)) {
    if (!listed && !isPublicAddress(host)) throw new EgressError("EGRESS_BLOCKED", `Address ${host} is private or reserved`);
    return host;
  }
  const addrs = await new Promise<LookupAddress[]>((resolve, reject) => dnsLookup(host, { all: true }, (e, a) => (e ? reject(e) : resolve(a))));
  if (addrs.length === 0) throw new EgressError("EGRESS_BLOCKED", `${host} did not resolve`);
  if (!listed) for (const a of addrs) if (!isPublicAddress(a.address)) throw new EgressError("EGRESS_BLOCKED", `${host} resolves to a private or reserved address`);
  return addrs[0]!.address;
}

// Lookup used by the socket: rejects private resolutions unless the host:port is allowlisted.
function guardedLookup(port: number, host: string) {
  const listed = isAllowlisted(host, port);
  return (hostname: string, options: object, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err, "");
      const list = addresses as LookupAddress[];
      if (!listed && list.some((a) => !isPublicAddress(a.address))) {
        return cb(new EgressError("EGRESS_BLOCKED", `${hostname} resolves to a private or reserved address`), "");
      }
      const wantAll = (options as { all?: boolean }).all;
      if (wantAll) cb(null, list);
      else cb(null, list[0]!.address, list[0]!.family);
    });
  };
}

const CREDENTIAL_HEADERS = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token|private-token|x-snowflake-authorization-token-type)$/i;

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

export interface SafeResponse {
  status: number;
  headers: Headers;
  url: string;
  body: Uint8Array;
  text(): string;
  json<T = unknown>(): T;
}

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let url = checkUrl(raw);
  let method = (opts.method ?? "GET").toUpperCase();
  let body = opts.body ?? null;
  let reqHeaders = opts.headers;

  for (let hop = 0; ; hop++) {
    const port = defaultPort(url);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const dispatcher: Dispatcher = new Agent({ connect: { lookup: guardedLookup(port, host) as never }, connections: 1 });
    try {
      const res = await undiciFetch(url, { method, headers: reqHeaders, body: body as never, redirect: "manual", signal, dispatcher });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc) throw new EgressError("EGRESS_INVALID_URL", "Redirect without Location");
        if (hop >= maxRedirects) throw new EgressError("EGRESS_TOO_MANY_REDIRECTS", `More than ${maxRedirects} redirects`);
        const next = checkUrl(new URL(loc, url));
        // Credentials never follow a redirect to a different origin.
        if (next.origin !== url.origin && reqHeaders) reqHeaders = Object.fromEntries(Object.entries(reqHeaders).filter(([k]) => !CREDENTIAL_HEADERS.test(k)));
        url = next;
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = null;
        }
        continue;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (res.body) {
        for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > maxBytes) throw new EgressError("EGRESS_TOO_LARGE", `Response is larger than ${Math.round(maxBytes / 1024)}KB`);
          chunks.push(chunk);
        }
      }
      const buf = new Uint8Array(size);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
      }
      const headers = new Headers();
      res.headers.forEach((v, k) => headers.set(k, v));
      return {
        status: res.status,
        headers,
        url: url.toString(),
        body: buf,
        text: () => new TextDecoder().decode(buf),
        json: <T>() => JSON.parse(new TextDecoder().decode(buf)) as T,
      };
    } catch (e) {
      // undici wraps lookup errors in a TypeError("fetch failed") with the real error as cause.
      const cause = (e as { cause?: unknown }).cause;
      if (cause instanceof EgressError) throw cause;
      throw e;
    } finally {
      void dispatcher.close();
    }
  }
}
