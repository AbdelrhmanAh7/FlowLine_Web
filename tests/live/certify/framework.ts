import { randomBytes } from "node:crypto";
import { createProviderHttp } from "@/integrations/http";
import { getAction, getProvider } from "@/integrations/registry";
import type { ActionContext, Credentials, ProviderDef, ProviderId } from "@/integrations/types";
import { credentialsFromFields } from "@/server/connections";
import { record, type LiveStatus } from "../record";

/**
 * Shared machinery for the live/sandbox certification suite (REL-LIVE-SUITE).
 *
 * Two modes:
 * - real (pnpm test:live:saas): inputs come from FLOWLINE_LIVE_<PROVIDER>[...] env vars;
 *   results land in artifacts/phase-3/live-results.json as PASS / FAIL / BLOCKED / N/A.
 * - dry-run (pnpm test:live:dryrun, FLOWLINE_LIVE_DRYRUN=1): the SAME scenario code runs
 *   against the local provider test double; results land in
 *   artifacts/phase-3/live-dryrun-results.json as DRYRUN_PASS / DRYRUN_FAIL / N/A.
 *   Dry-run never writes the real results file and never records PASS.
 *
 * Credential and target values are never logged or recorded — only ids, labels and
 * error messages produced by the providers.
 */
export const DRYRUN = process.env.FLOWLINE_LIVE_DRYRUN === "1";
export const RESULTS_FILE = DRYRUN ? "artifacts/phase-3/live-dryrun-results.json" : "artifacts/phase-3/live-results.json";

type Fields = Record<string, string>;

/** Fake credentials/targets for the dry-run against the local test double (no real secrets). */
const DRYRUN_INPUTS: Record<string, { fields: Fields; revoked: Fields; target?: Fields }> = {
  google_sheets: { fields: { token: "test-token" }, revoked: { token: "revoked-token" }, target: { spreadsheetId: "sheet-1", tab: "Cert" } },
  gmail: { fields: { token: "test-token" }, revoked: { token: "revoked-token" } },
  slack: { fields: { token: "test-token" }, revoked: { token: "revoked-token" }, target: { channel: "C001GEN" } },
  hubspot: { fields: { token: "test-token" }, revoked: { token: "revoked-token" } },
  zendesk: {
    fields: { email: "agent@flowline.test", token: "test-token", subdomain: "acme" },
    revoked: { email: "agent@flowline.test", token: "revoked-token", subdomain: "acme" },
  },
  airtable: { fields: { token: "test-token" }, revoked: { token: "revoked-token" }, target: { baseId: "appTest", table: "Invoices", field: "Invoice ID" } },
  snowflake: {
    fields: { accountUrl: "https://xy12345.snowflakecomputing.com", token: "test-token" },
    revoked: { accountUrl: "https://xy12345.snowflakecomputing.com", token: "revoked-token" },
  },
  github: { fields: { token: "test-token" }, revoked: { token: "revoked-token" }, target: { owner: "flowline", repo: "demo", issue: "7", pr: "7" } },
  stripe: { fields: { token: "sk_test_fake" }, revoked: { token: "sk_test_revoked" } },
  notion: { fields: { token: "test-token" }, revoked: { token: "revoked-token" }, target: { parentPageId: "page-seed-1" } },
  linear: { fields: { token: "test-token" }, revoked: { token: "revoked-token" }, target: { teamId: "team-eng" } },
};

function parseJsonEnv(key: string): { value?: Fields; error?: string } {
  const raw = process.env[key];
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { error: `${key} must be a JSON object of string fields` };
    return { value: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x)])) };
  } catch {
    return { error: `${key} is not valid JSON` };
  }
}

function buildCreds(p: ProviderDef, fields: Fields): Credentials {
  if (p.authType === "oauth2") {
    if (!fields.token) throw new Error('missing the "token" field');
    return { type: "oauth2", token: fields.token };
  }
  return credentialsFromFields(p, fields);
}

export interface CheckOptions {
  /** The check needs FLOWLINE_LIVE_<PROVIDER>_TARGET. */
  needsTarget?: boolean;
  /** Genuinely not applicable (e.g. a write on the read-only Snowflake provider) — recorded N/A. */
  na?: string;
  /** Record BLOCKED with this reason instead of running (e.g. a dependency failed). */
  skip?: string;
}

export class CertSession {
  /** Unique marker embedded in every artifact this run creates, so verify can find it. */
  readonly marker = `flowline-cert-${randomBytes(6).toString("hex")}`;
  private failures: string[] = [];

  constructor(
    readonly provider: ProviderDef,
    readonly creds: Credentials | null,
    readonly credsBlocked: string | null,
    readonly target: Fields | null,
    readonly targetBlocked: string | null,
    readonly revoked: Credentials | null,
  ) {}

  get envBase(): string {
    return `FLOWLINE_LIVE_${this.provider.id.toUpperCase()}`;
  }

  ctx(creds: Credentials = this.creds!): ActionContext {
    const signal = AbortSignal.timeout(60_000);
    return {
      http: createProviderHttp(this.provider, creds, signal),
      credentials: creds,
      idempotencyKey: `cert-${randomBytes(8).toString("hex")}`,
      signal,
      log: () => {},
    };
  }

  /** Runs a registered action with input parsing and output validation. */
  async run<O = unknown>(actionId: string, input: unknown, ctx: ActionContext = this.ctx()): Promise<O> {
    const found = getAction(actionId);
    if (!found) throw new Error(`Action ${actionId} is not registered`);
    const parsed = found.action.input.parse(input);
    const out = await found.action.run(ctx, parsed);
    return found.action.output.parse(out) as O;
  }

  /** Runs an action's post-hoc verify (same idempotency key → pass the SAME ctx used for run). */
  async verifyAction<O = unknown>(actionId: string, input: unknown, ctx: ActionContext): Promise<{ happened: boolean; output?: O }> {
    const found = getAction(actionId);
    if (!found?.action.verify) throw new Error(`Action ${actionId} has no verify`);
    const parsed = found.action.input.parse(input);
    return found.action.verify(ctx, parsed) as Promise<{ happened: boolean; output?: O }>;
  }

  private write(status: "PASS" | "FAIL" | "BLOCKED" | "N/A", id: string, detail: Record<string, unknown>) {
    const mapped: LiveStatus = DRYRUN ? (status === "PASS" ? "DRYRUN_PASS" : status === "N/A" ? "N/A" : "DRYRUN_FAIL") : status;
    record(id, mapped, detail, RESULTS_FILE);
  }

  /**
   * Runs one certification check and records it as `<provider>.<name>`.
   * Returns the check's detail object, or undefined when the check did not run/pass —
   * dependent checks should then record BLOCKED via `skip`. Failures never abort the
   * remaining checks; assertAllPassed() at the end fails the vitest test.
   */
  async check(name: string, fn: () => Promise<Record<string, unknown> | void>, opts: CheckOptions = {}): Promise<Record<string, unknown> | undefined> {
    const id = `${this.provider.id}.${name}`;
    const reason =
      this.credsBlocked ??
      (this.creds ? null : `missing credentials (${this.envBase})`) ??
      (opts.needsTarget ? (this.targetBlocked ?? (this.target ? null : `missing test target (${this.envBase}_TARGET)`)) : null) ??
      opts.skip ??
      null;
    if (reason) {
      this.write("BLOCKED", id, { reason });
      if (DRYRUN) this.failures.push(`${id}: unexpectedly blocked in dry-run: ${reason}`);
      return undefined;
    }
    if (opts.na !== undefined) {
      this.write("N/A", id, { note: opts.na });
      return undefined;
    }
    try {
      const detail = (await fn()) ?? {};
      this.write("PASS", id, detail);
      return detail;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.write("FAIL", id, { error: message });
      this.failures.push(`${id}: ${message}`);
      return undefined;
    }
  }

  assertAllPassed() {
    if (this.failures.length) throw new Error(`certification failures:\n${this.failures.join("\n")}`);
  }
}

export function buildSession(providerId: ProviderId): CertSession {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Provider ${providerId} is not registered`);

  if (DRYRUN) {
    const d = DRYRUN_INPUTS[providerId];
    if (!d) throw new Error(`No dry-run inputs for ${providerId}`);
    return new CertSession(provider, buildCreds(provider, d.fields), null, d.target ?? null, null, buildCreds(provider, d.revoked));
  }

  const base = `FLOWLINE_LIVE_${providerId.toUpperCase()}`;
  const fields = parseJsonEnv(base);
  const target = parseJsonEnv(`${base}_TARGET`);
  const revoked = parseJsonEnv(`${base}_REVOKED`);

  let creds: Credentials | null = null;
  let credsBlocked: string | null = null;
  if (fields.error) credsBlocked = fields.error;
  else if (fields.value) {
    try {
      creds = buildCreds(provider, fields.value);
    } catch (e) {
      credsBlocked = `invalid ${base}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  // Stripe policy: the suite refuses anything but test-mode secret keys before any request.
  if (providerId === "stripe" && creds && !(creds.token ?? "").startsWith("sk_test_")) {
    creds = null;
    credsBlocked = `refusing to run: ${base} must be a Stripe TEST-mode secret key (sk_test_…)`;
  }

  let revokedCreds: Credentials | null = null;
  if (revoked.value) {
    try {
      revokedCreds = buildCreds(provider, revoked.value);
    } catch {
      revokedCreds = null;
    }
  }

  return new CertSession(provider, creds, credsBlocked, target.value ?? null, target.error ?? null, revokedCreds);
}
