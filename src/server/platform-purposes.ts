/**
 * The fixed catalogue of PLATFORM credential purposes and settings (docs/security/CREDENTIALS_DESIGN.md §1, §5).
 *
 * Each purpose names exactly one credential for exactly one server service. Endpoints, scopes, redirect URIs and
 * auth methods are reviewed code (MUST 11): admins only ever supply a public id (client id / sender / client token)
 * and a secret. The environment-variable names below are used ONLY by the explicit, audited, once-per-purpose
 * "Import from environment" action — no runtime path reads them.
 */
export type PurposeKind = "oauth_signin" | "oauth_integration" | "email" | "billing_api" | "billing_webhook";

export interface PurposeDef {
  purpose: string;
  kind: PurposeKind;
  /** Provider id (for display, AAD and probes). */
  provider: string;
  /** What the public half is, if the purpose has one. */
  publicId: null | { label: "clientId" | "sender" | "clientToken"; required: true; pattern: RegExp; testPattern?: RegExp };
  secret: { min: number; max: number };
  /** How long the previous secret keeps working after a rotation (0 = the provider doesn't support overlap). */
  graceMs: number;
  /** Import-from-environment mapping (migration only). */
  env: { publicId?: string; secret: string };
}

const DAY = 86_400_000;
const CLIENT_ID_ANY = /^[A-Za-z0-9._-]{4,200}$/;

export const PURPOSES: readonly PurposeDef[] = [
  {
    purpose: "signin.zitadel", kind: "oauth_signin", provider: "zitadel",
    publicId: { label: "clientId", required: true, pattern: /^[A-Za-z0-9@._:-]{4,300}$/ },
    secret: { min: 8, max: 512 }, graceMs: 7 * DAY,
    env: { secret: "" },
  },
  {
    purpose: "signin.google",
    kind: "oauth_signin",
    provider: "google",
    publicId: { label: "clientId", required: true, pattern: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/, testPattern: CLIENT_ID_ANY },
    secret: { min: 8, max: 512 },
    graceMs: 7 * DAY,
    env: { publicId: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  },
  {
    purpose: "signin.github",
    kind: "oauth_signin",
    provider: "github",
    publicId: { label: "clientId", required: true, pattern: /^(Iv1\.[a-f0-9]{16}|Ov23li[A-Za-z0-9]{14}|[a-f0-9]{20})$/, testPattern: CLIENT_ID_ANY },
    secret: { min: 8, max: 512 },
    graceMs: 7 * DAY,
    env: { publicId: "GITHUB_CLIENT_ID", secret: "GITHUB_CLIENT_SECRET" },
  },
  {
    purpose: "integration.google",
    kind: "oauth_integration",
    provider: "google",
    publicId: { label: "clientId", required: true, pattern: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/, testPattern: CLIENT_ID_ANY },
    secret: { min: 8, max: 512 },
    graceMs: 7 * DAY,
    env: { publicId: "GOOGLE_OAUTH_CLIENT_ID", secret: "GOOGLE_OAUTH_CLIENT_SECRET" },
  },
  {
    purpose: "integration.slack",
    kind: "oauth_integration",
    provider: "slack",
    publicId: { label: "clientId", required: true, pattern: /^[0-9]+\.[0-9]+$/, testPattern: CLIENT_ID_ANY },
    secret: { min: 8, max: 512 },
    // Slack regenerates a client secret and the old one stops working immediately: no overlap window.
    graceMs: 0,
    env: { publicId: "SLACK_OAUTH_CLIENT_ID", secret: "SLACK_OAUTH_CLIENT_SECRET" },
  },
  {
    purpose: "integration.github",
    kind: "oauth_integration",
    provider: "github",
    publicId: { label: "clientId", required: true, pattern: /^(Iv1\.[a-f0-9]{16}|Ov23li[A-Za-z0-9]{14}|[a-f0-9]{20})$/, testPattern: CLIENT_ID_ANY },
    secret: { min: 8, max: 512 },
    graceMs: 7 * DAY,
    env: { publicId: "GITHUB_OAUTH_CLIENT_ID", secret: "GITHUB_OAUTH_CLIENT_SECRET" },
  },
  {
    purpose: "email.resend",
    kind: "email",
    provider: "resend",
    publicId: { label: "sender", required: true, pattern: /^[^\r\n<>]{0,80}<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/ },
    secret: { min: 8, max: 512 },
    graceMs: 0,
    env: { publicId: "FLOWLINE_EMAIL_FROM", secret: "FLOWLINE_EMAIL_RESEND_KEY" },
  },
  {
    purpose: "email.postmark",
    kind: "email",
    provider: "postmark",
    publicId: { label: "sender", required: true, pattern: /^[^\r\n<>]{0,80}<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/ },
    secret: { min: 8, max: 512 },
    graceMs: 0,
    env: { publicId: "FLOWLINE_EMAIL_FROM", secret: "FLOWLINE_EMAIL_POSTMARK_TOKEN" },
  },
  {
    purpose: "billing.paddle.sandbox",
    kind: "billing_api",
    provider: "paddle",
    // The client-side token is public by design (Paddle.js); only a sandbox `test_…` token is accepted here.
    publicId: { label: "clientToken", required: true, pattern: /^test_[A-Za-z0-9]{8,120}$/ },
    secret: { min: 8, max: 512 },
    graceMs: 0,
    env: { publicId: "FLOWLINE_BILLING_PADDLE_CLIENT_TOKEN", secret: "FLOWLINE_BILLING_PADDLE_KEY" },
  },
  {
    purpose: "billing.paddle.sandbox.webhook",
    kind: "billing_webhook",
    provider: "paddle",
    publicId: null,
    secret: { min: 8, max: 512 },
    graceMs: DAY,
    env: { secret: "FLOWLINE_BILLING_PADDLE_WEBHOOK_SECRET" },
  },
  {
    purpose: "billing.stripe.test",
    kind: "billing_api",
    provider: "stripe",
    publicId: null,
    secret: { min: 8, max: 512 },
    graceMs: 0,
    env: { secret: "FLOWLINE_BILLING_STRIPE_KEY" },
  },
  {
    purpose: "billing.stripe.test.webhook",
    kind: "billing_webhook",
    provider: "stripe",
    publicId: null,
    secret: { min: 8, max: 512 },
    graceMs: DAY,
    env: { secret: "FLOWLINE_BILLING_WEBHOOK_SECRET" },
  },
] as const;

export type Purpose = (typeof PURPOSES)[number]["purpose"];

export function purposeDef(purpose: string): PurposeDef | undefined {
  return PURPOSES.find((p) => p.purpose === purpose);
}

/** Integration provider families: one OAuth app serves every provider of its family (Gmail + Sheets share Google's). */
export const OAUTH_FAMILIES = {
  google: { providers: ["google_sheets", "gmail"], purpose: "integration.google" },
  slack: { providers: ["slack"], purpose: "integration.slack" },
  github: { providers: ["github"], purpose: "integration.github" },
} as const;
export type OAuthFamily = keyof typeof OAUTH_FAMILIES;

export function familyOf(providerId: string): OAuthFamily | null {
  for (const [f, def] of Object.entries(OAUTH_FAMILIES)) if ((def.providers as readonly string[]).includes(providerId)) return f as OAuthFamily;
  return null;
}

/* ───────────── settings (validated, versioned, not secrets) ───────────── */

export const SETTING_KEYS = ["email.provider", "email.allowed_recipients", "billing.provider", "billing.plans", "signin.zitadel.issuer"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Import-from-environment mapping for settings (migration only). */
export const SETTING_ENV: Record<SettingKey, string[]> = {
  "email.provider": ["FLOWLINE_EMAIL_PROVIDER"],
  "email.allowed_recipients": ["FLOWLINE_EMAIL_ALLOWED_RECIPIENTS"],
  "billing.provider": ["FLOWLINE_BILLING_PROVIDER"],
  "billing.plans": ["FLOWLINE_BILLING_PLANS", "FLOWLINE_BILLING_FREE_PLAN"],
  "signin.zitadel.issuer": [],
};

/** Every env var that USED to carry a now UI-managed value (the panel lists the ones still set so operators remove them). */
export function legacyEnvVars(): string[] {
  return [...new Set([...PURPOSES.flatMap((p) => [p.env.publicId, p.env.secret].filter((x): x is string => Boolean(x))), ...Object.values(SETTING_ENV).flat()])];
}
