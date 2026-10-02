/** Local fixed metadata URL; never derived from a request host or tenant input. */
export function zitadelLocalUrl(path: "discovery" | "jwks") {
  const base = process.env.BETTER_AUTH_URL ?? process.env.FLOWLINE_PUBLIC_URL;
  if (!base) return null;
  return new URL(`/api/identity/zitadel/${path}`, base).toString();
}
