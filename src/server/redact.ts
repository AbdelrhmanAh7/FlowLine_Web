/**
 * Redaction for anything persisted to run steps, events, logs or shown in the
 * payload inspector. Known secret values (the credentials used by this step) are
 * replaced exactly; well-known token shapes and sensitive keys are masked too.
 */
const PATTERNS: [RegExp, string][] = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/g, "[REDACTED_STRIPE_KEY]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{8,}/g, "[REDACTED_SLACK_TOKEN]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bpat[A-Za-z0-9]{10,}\.[A-Za-z0-9]{20,}/g, "[REDACTED_AIRTABLE_TOKEN]"],
  [/\bsecret_[A-Za-z0-9]{20,}/g, "[REDACTED_NOTION_TOKEN]"],
  [/\blin_api_[A-Za-z0-9]{20,}/g, "[REDACTED_LINEAR_KEY]"],
  [/\bya29\.[A-Za-z0-9._-]{10,}/g, "[REDACTED_GOOGLE_TOKEN]"],
  [/\bpat-[a-z0-9]{2,4}-[a-f0-9-]{20,}/gi, "[REDACTED_HUBSPOT_TOKEN]"],
  [/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[REDACTED]@"],
  [/\b(sk-ant-|sk-proj-|sk-)[A-Za-z0-9_-]{16,}/g, "[REDACTED_API_KEY]"],
  // Drizzle/pg "Failed query … params: …" errors carry bound values (session tokens, emails): never log them.
  // The parameter tail can contain arbitrary newlines and nested error text.
  [/(\bparams:)[\s\S]*/gi, "$1 [omitted]"],
];

/** Loggable text for an error (message + causes), with bound query params and known secret shapes removed. */
export function safeErrorText(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; e && i < 4; i++) {
    parts.push(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    e = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
  }
  return redactString(parts.join(" ← caused by "));
}

const SENSITIVE_KEYS = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret|private[_-]?key|token)$/i;

export function redactString(s: string, secrets: readonly string[] = []): string {
  let out = s;
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join("[REDACTED]");
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redact<T>(value: T, secrets: readonly string[] = [], depth = 0): T {
  // Unexamined data must never escape the traversal budget, including cyclic inputs.
  if (depth > 30) return "[REDACTED_LIMIT]" as T;
  if (typeof value === "string") return redactString(value, secrets) as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, secrets, depth + 1)) as T;
  if (value instanceof Date) return value; // timestamps carry no secrets; a plain-object copy would lose them
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) && v != null && v !== "" ? "[REDACTED]" : redact(v, secrets, depth + 1);
    }
    return out as T;
  }
  return value;
}
