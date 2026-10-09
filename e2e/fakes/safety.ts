/**
 * Input hardening shared by the e2e fake servers (CodeQL triage #114; notes in docs/security/codeql-triage-fakes.md).
 * Test-only code: these fakes listen on 127.0.0.1 and are never deployed.
 */
import type { IncomingMessage } from "node:http";

const MAX_PATTERN_LENGTH = 200;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Fault path patterns arrive over the control API, so they are never compiled as a RegExp (regex injection / ReDoS).
 * Supported: an optional leading `^` (path starts with) and trailing `$` (path ends with); both = exact match;
 * otherwise a substring match. `\x` escapes are read as the plain character, so `^/a\.b$` still means "/a.b".
 * Returns null for an empty or oversized pattern.
 */
export function compileFaultPattern(raw: unknown): { test(path: string): boolean } | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATTERN_LENGTH) return null;
  const start = raw.startsWith("^");
  const body = start ? raw.slice(1) : raw;
  const end = body.endsWith("$") && !body.endsWith("\\$");
  const text = (end ? body.slice(0, -1) : body).replace(/\\(.)/g, "$1");
  if (!text) return null;
  return {
    test: (path) => (start && end ? path === text : start ? path.startsWith(text) : end ? path.endsWith(text) : path.includes(text)),
  };
}

/**
 * Allowlist for redirect targets taken from a request: a same-site relative path, or an http(s) URL on a loopback host.
 * Returns the (optionally parameterised) Location value, or null when the target is not allowed.
 */
export function safeRedirectTarget(raw: string, params: Record<string, string | null | undefined> = {}): string | null {
  const base = "http://fake.local";
  let relative = false;
  let url: URL;
  try {
    if (raw.startsWith("/")) {
      if (raw.startsWith("//") || raw.includes("\\")) return null;
      relative = true;
      url = new URL(raw, base);
      if (url.origin !== base) return null;
    } else {
      url = new URL(raw);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !LOOPBACK_HOSTS.has(url.hostname)) return null;
    }
  } catch {
    return null;
  }
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/** Reads a request body, rejecting with BodyTooLargeError (and stopping the read) once it passes `limit` bytes. */
export function readCappedBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        chunks.length = 0;
        reject(new BodyTooLargeError(limit));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!done) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (e) => {
      if (!done) reject(e);
    });
  });
}
