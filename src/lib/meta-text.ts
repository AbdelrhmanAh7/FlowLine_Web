/** A step-meta value as text. Objects/arrays (e.g. `fallbackFrom`) render as compact JSON, never "[object Object]" (CXQ-03). */
export function metaText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
