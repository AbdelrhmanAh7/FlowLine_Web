/**
 * Pure helpers shared by the release / load scripts (unit-tested in tests/unit/release-scripts.test.ts).
 * No I/O here.
 */

const PATHS = { verify: "/verify-email", reset: "/reset-password" };

/**
 * The single-use token from a Flowline account email (plain text or HTML), e.g. the verification link
 * `http://host/verify-email?token=…&callbackURL=…`. Returns null when the text holds no such link.
 * @param {string | null | undefined} text
 * @param {"verify" | "reset"} [purpose]
 */
export function extractEmailToken(text, purpose = "verify") {
  if (!text) return null;
  const path = PATHS[purpose];
  if (!path) throw new Error(`unknown email purpose "${purpose}"`);
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    let url;
    try {
      url = new URL(m[0].replace(/&amp;/g, "&").replace(/[.,;:)\]]+$/, ""));
    } catch {
      continue;
    }
    if (url.pathname !== path) continue;
    const token = url.searchParams.get("token");
    // Same shape the server accepts (src/server/email/flows.ts tokenState).
    if (token && /^[A-Za-z0-9_-]{40,100}$/.test(token)) return token;
  }
  return null;
}

/**
 * KEY=value lines of a dotenv-style file (no interpolation, no quotes stripping beyond one matching pair).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Nearest-rank percentile, rounded to whole ms. null for an empty sample.
 * @param {number[]} xs
 * @param {number} p
 */
export function percentile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]);
}
