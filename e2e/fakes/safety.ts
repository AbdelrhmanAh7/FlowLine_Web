import type { IncomingMessage } from "node:http";
const MAX_PATTERN_LENGTH = 200;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DROPPED_REGEX_SYNTAX = /[*+?|()[\]{}]/;
/** Text matching: optional leading `^`, trailing `$` (path ends with); `^/a\.b$` still means "/a.b". */
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
/** Allow relative paths and credential-free HTTP(S) loopback URLs; reject normalised //host paths. */
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
/** Stop buffering at the byte cap and drain refused uploads. */
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
/** Relational upper-bound guard recognised by CodeQL: [0, 10 s], default 1000 ms, explicit 0 preserved. */
export function slowDelayMs(raw: unknown): number {
  const n = Number(raw ?? 1000);
  const wanted = Number.isFinite(n) ? n : 1000;
  if (wanted > MAX_FAKE_DELAY_MS) return MAX_FAKE_DELAY_MS;
  if (wanted < 0) return 0;
  return wanted;
}
