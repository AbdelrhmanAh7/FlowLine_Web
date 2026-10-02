/**
 * Builds the list of substrings that must never appear in a public projection ("needles").
 *
 * The leak checks assert `JSON.stringify(response)` does not contain any needle. A needle that is
 * too short (a single base64url character, an empty split artefact) matches unrelated JSON and makes
 * the test fail at random, so every needle must be at least `MIN_NEEDLE_LENGTH` characters long.
 * Secrets are asserted in full; derived fragments are built here, never with ad-hoc `split().pop()`.
 */
export const MIN_NEEDLE_LENGTH = 8;

const API_KEY_RE = /^fl_(test|live)_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

/**
 * The random secret part of a `fl_<mode>_<prefix>_<secret>` API key. The secret is base64url and may
 * itself contain `_` and `-`, so it is taken by shape, not by splitting on underscores.
 */
export function apiKeySecret(key: string): string {
  const m = API_KEY_RE.exec(key);
  if (!m) throw new Error(`not an API key: ${JSON.stringify(key)}`);
  return m[3]!;
}

/** The token at the end of an invite URL (`…/invite/<token>`); never empty, never a query string. */
export function inviteTokenFromUrl(url: string): string {
  const m = /\/invite\/([A-Za-z0-9_-]+)$/.exec(url);
  if (!m) throw new Error(`not an invite URL: ${JSON.stringify(url)}`);
  return m[1]!;
}

/** Fixed identifiers (column names such as `keyHash`) are deterministic; they only need to be real words. */
export const MIN_FIELD_NAME_LENGTH = 4;

/**
 * Validates needles before they are used. `secrets` are values derived from random data (full secrets,
 * tokens, ciphertext, fragments) and must be at least `MIN_NEEDLE_LENGTH` characters; `fields` are fixed
 * identifiers (secret-bearing column names) and must be at least `MIN_FIELD_NAME_LENGTH`. Throws instead
 * of silently dropping, so a mis-built fragment fails the test deterministically rather than becoming a
 * random false positive (too short) or a silently weakened check (dropped).
 */
export function secretNeedles(input: { fields?: readonly string[]; secrets: readonly string[] }): string[] {
  const out: string[] = [];
  const take = (values: readonly string[], min: number, kind: string) => {
    for (const v of values) {
      if (typeof v !== "string") throw new Error(`${kind} needle is not a string: ${JSON.stringify(v)}`);
      if (v.length < min) throw new Error(`${kind} needle ${JSON.stringify(v)} is shorter than ${min} characters; it would match unrelated text`);
      out.push(v);
    }
  };
  take(input.fields ?? [], MIN_FIELD_NAME_LENGTH, "field");
  take(input.secrets, MIN_NEEDLE_LENGTH, "secret");
  if (input.secrets.length === 0) throw new Error("secret needle list is empty");
  return out;
}
