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
 * Returns null for an empty or oversized pattern. Regex syntax that text matching silently drops (quantifiers,
 * alternation, groups, character classes) logs a warning so a pattern that never fires is visible in the server log.
 */
const DROPPED_REGEX_SYNTAX = /[*+?|()[\]{}]/;

export function compileFaultPattern(raw: unknown): { test(path: string): boolean } | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATTERN_LENGTH) return null;
  const start = raw.startsWith("^");
  const body = start ? raw.slice(1) : raw;
  const end = body.endsWith("$") && !body.endsWith("\\$");
  if (DROPPED_REGEX_SYNTAX.test(body)) {
    console.warn(`[fake-providers] pathPattern ${JSON.stringify(raw)} uses regex syntax that text matching drops (quantifiers, alternation, groups, character classes) and is matched literally; use anchors and \\x escapes only`);
  }
  const text = (end ? body.slice(0, -1) : body).replace(/\\(.)/g, "$1");
  if (!text) return null;
  return {
    test: (path) => (start && end ? path === text : start ? path.startsWith(text) : end ? path.endsWith(text) : path.includes(text)),
  };
}

/**
 * Allowlist for redirect targets taken from a request: a same-site relative path, or an http(s) URL on a loopback host.
 * Returns the (optionally parameterised) Location value, or null when the target is not allowed. A relative path that
 * normalises to a protocol-relative Location (e.g. /..//host, which parses to //host) is refused.
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
  const location = relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  return location.startsWith("//") ? null : location;
}

export class BodyTooLargeError extends Error {
  name = "BodyTooLargeError";
}

/**
 * Reads a request body, rejecting with BodyTooLargeError (and dropping what it read) once it passes `limit` bytes.
 * The refused upload is then drained without buffering, so a client cannot keep streaming into the socket.
 */
export function readCappedBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.removeListener("data", onData);
        req.resume();
        chunks.length = 0;
        return void reject(new BodyTooLargeError(`request body exceeds ${limit} bytes`));
      }
      chunks.push(c);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MAX_FAKE_DELAY_MS = 10_000;

/**
 * Timer duration for the AI fake's `slow` fault: the requested value clamped to [0, 10 s]
 * (a missing, null or non-numeric value = 1000; an explicit 0 stays 0), so the timer is always bounded
 * and in-range delays keep their exact timing.
 */
export function slowDelayMs(raw: unknown): number {
  const n = Number(raw ?? 1000);
  const wanted = Number.isFinite(n) ? n : 1000;
  return Math.min(Math.max(wanted, 0), MAX_FAKE_DELAY_MS);
}
