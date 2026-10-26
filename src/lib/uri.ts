/** True when the path or query string holds a percent-escape that does not decode (e.g. `%E0%A4%A`, `%zz`, a lone `%`). */
export function hasMalformedPercentEscape(pathname: string, search: string): boolean {
  try {
    decodeURIComponent(pathname);
    // Strip the leading "?" and decode name and value on their own, as URLSearchParams consumers do.
    for (const part of search.replace(/^\?/, "").split("&")) decodeURIComponent(part.replace(/\+/g, " "));
    return false;
  } catch {
    return true;
  }
}
