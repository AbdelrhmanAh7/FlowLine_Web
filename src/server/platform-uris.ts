/**
 * The exact redirect URIs admins must register at each provider (MUST 12), computed from the SAME trusted operator
 * configuration the flows use (FLOWLINE_PUBLIC_URL / BETTER_AUTH_URL) — never from a request or a tenant.
 */
function origin(u: string | undefined) {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
}

export function platformRedirectUris() {
  const pub = (process.env.FLOWLINE_PUBLIC_URL ?? "").replace(/\/$/, "");
  const authOrigin = origin(process.env.BETTER_AUTH_URL) ?? origin(process.env.FLOWLINE_PUBLIC_URL);
  const warnings: string[] = [];
  if (!pub) warnings.push("FLOWLINE_PUBLIC_URL_UNSET");
  else if (pub.startsWith("http:") && process.env.FLOWLINE_ENV !== "test" && process.env.NODE_ENV === "production") warnings.push("FLOWLINE_PUBLIC_URL_NOT_HTTPS");
  if (!authOrigin) warnings.push("BETTER_AUTH_URL_UNSET");
  return {
    integrations: pub ? `${pub}/api/oauth/callback` : null,
    signin: { google: authOrigin ? `${authOrigin}/api/auth/callback/google` : null, github: authOrigin ? `${authOrigin}/api/auth/callback/github` : null },
    sso: pub ? `${pub}/api/sso/callback` : null,
    warnings,
  };
}
