/** Absolute billing URLs on our own domain, built from FLOWLINE_PUBLIC_URL (never from request input). */
export function publicBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Where a finished or abandoned checkout returns to. */
export function settingsUrls(slug: string) {
  const base = publicBase();
  return { successUrl: `${base}/w/${slug}/settings?billing=success`, cancelUrl: `${base}/w/${slug}/settings?billing=cancelled` };
}

/** Our Paddle checkout page, sent as a transaction's `checkout.url` (Paddle appends `_ptxn`). */
export function checkoutPageUrl(slug: string): string {
  return `${publicBase()}/billing/checkout?ws=${encodeURIComponent(slug)}`;
}
