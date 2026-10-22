/**
 * Returns true if the identifier is an ambiguous template/URL placeholder string
 * (e.g. `{slug}`, `[slug]`, `:slug`, `{wid}`, `[wid]`, `:wid`).
 * Plain tenant names like "slug" or "wid" are valid slugs and are not rejected.
 */
export function isPlaceholderSlug(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    trimmed.startsWith(":")
  );
}
