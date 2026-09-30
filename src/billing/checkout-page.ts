/**
 * Server logic for our Paddle checkout page (`/billing/checkout`).
 *
 * In Paddle Billing a transaction's `checkout.url` is OUR page: Paddle returns it with
 * `?_ptxn=txn_…` appended, and that page must load Paddle.js, initialize it with a
 * client-side token and open the checkout for the transaction
 * (developer.paddle.com/build/transactions/pass-transaction-checkout). This module
 * decides what the page may render; the browser part lives in the page's client component.
 *
 * Only the client-side token (designed to be public: `test_…` / `live_…`) is handed to
 * the browser — never the API key or the webhook secret.
 */
import { allowed, requireWorkspaceBySlug, type CurrentUser } from "@/server/access";
import { notFound } from "@/server/http";
import { settingsUrls } from "./urls";

/** Production always loads Paddle.js from Paddle's CDN. */
export const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

const TXN_RE = /^txn_[a-z0-9]+$/i;
/** Workspace slugs as `slugify` produces them. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PaddleClientConfig =
  | { ok: true; token: string; environment: "sandbox" | "live"; scriptUrl: string }
  | { ok: false; reason: "not_configured" | "live_token_refused" | "token_env_mismatch" | "invalid_token" };

/**
 * The Paddle.js configuration for the browser. The client-side token comes from the platform admin panel (the public
 * half of `billing.paddle.sandbox`); the environment keeps only the operator safety gates. Mirrors the API-key guard
 * in PaddlePaymentAdapter: a live client token (`live_…`) is refused unless FLOWLINE_BILLING_ALLOW_LIVE=true and
 * FLOWLINE_BILLING_PADDLE_ENV=live.
 */
export function paddleClientConfig(cfg: { provider: string | null; token: string | null }, env: NodeJS.ProcessEnv = process.env): PaddleClientConfig {
  if ((cfg.provider ?? "").toLowerCase() !== "paddle") return { ok: false, reason: "not_configured" };
  const token = cfg.token?.trim();
  if (!token) return { ok: false, reason: "not_configured" };
  const environment = env.FLOWLINE_BILLING_PADDLE_ENV === "live" ? "live" : "sandbox";
  if (token.startsWith("live_")) {
    if (!(environment === "live" && env.FLOWLINE_BILLING_ALLOW_LIVE === "true")) return { ok: false, reason: "live_token_refused" };
  } else if (token.startsWith("test_")) {
    if (environment !== "sandbox") return { ok: false, reason: "token_env_mismatch" };
  } else {
    return { ok: false, reason: "invalid_token" };
  }
  // A stand-in Paddle.js is allowed only in the test environment.
  const override = env.FLOWLINE_ENV === "test" ? env.FLOWLINE_TEST_PADDLE_JS_URL?.trim() : undefined;
  return { ok: true, token, environment, scriptUrl: override || PADDLE_JS_URL };
}

/** Reads the active billing provider and the Paddle client token from the platform panel (per request, no cache). */
export async function currentPaddleClientConfig(): Promise<PaddleClientConfig> {
  const { getSetting } = await import("@/server/platform-settings");
  const { platformCredentialStatus } = await import("@/server/platform-secrets");
  const provider = (await getSetting("billing.provider"))?.value ?? null;
  const status = await platformCredentialStatus("billing.paddle.sandbox");
  return paddleClientConfig({ provider, token: status?.configured ? status.publicId : null });
}

export type CheckoutPageState =
  | { kind: "ready"; workspaceName: string; settingsPath: string; transactionId: string; token: string; environment: "sandbox" | "live"; scriptUrl: string; successUrl: string }
  | { kind: "forbidden"; workspaceName: string; settingsPath: string }
  | { kind: "invalid_transaction"; workspaceName: string; settingsPath: string }
  | { kind: "not_configured" | "live_token_refused" | "token_env_mismatch" | "invalid_token"; workspaceName: string; settingsPath: string };

/**
 * Resolves what the checkout page renders. Throws a 404 HttpError for a malformed slug or a
 * non-member (existence isn't leaked). The success URL is always built here from the
 * workspace slug and FLOWLINE_PUBLIC_URL — never taken from the query (no open redirect).
 */
export async function resolveCheckoutPage(user: CurrentUser, query: { ws?: string | string[]; _ptxn?: string | string[] }): Promise<CheckoutPageState> {
  const slug = typeof query.ws === "string" ? query.ws : "";
  if (!slug || slug.length > 64 || !SLUG_RE.test(slug)) throw notFound("Workspace not found");
  const row = await requireWorkspaceBySlug(user, slug);
  if (!row) throw notFound("Workspace not found");
  const base = { workspaceName: row.workspace.name, settingsPath: `/w/${row.workspace.slug}/settings?tab=plan` };
  if (!allowed(row.role, "billing.manage")) return { kind: "forbidden", ...base };
  const cfg = await currentPaddleClientConfig();
  if (!cfg.ok) return { kind: cfg.reason, ...base };
  const txn = typeof query._ptxn === "string" ? query._ptxn : "";
  if (!txn || txn.length > 64 || !TXN_RE.test(txn)) return { kind: "invalid_transaction", ...base };
  return {
    kind: "ready",
    ...base,
    transactionId: txn,
    token: cfg.token,
    environment: cfg.environment,
    scriptUrl: cfg.scriptUrl,
    successUrl: settingsUrls(row.workspace.slug).successUrl,
  };
}
