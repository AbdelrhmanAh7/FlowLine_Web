import { describe, expect, it } from "vitest";
import { createProviderHttp } from "@/integrations/http";
import { listProviders } from "@/integrations/registry";
import type { Credentials } from "@/integrations/types";
import { credentialsFromFields } from "@/server/connections";
import { live, record } from "./record";

/**
 * Sandbox-live identity checks for SaaS adapters. Each needs a dedicated sandbox/test
 * account supplied by the owner as FLOWLINE_LIVE_<PROVIDER> = JSON of its connect fields
 * (for OAuth apps: {"token": "<access token>"}). Missing → BLOCKED, never faked or PASS.
 * Only read-only identity calls are made; nothing is written to the account.
 */
const saas = listProviders().filter((p) => p.id !== "postgres");

describe("live SaaS identity (sandbox accounts)", () => {
  for (const p of saas) {
    const envKey = `FLOWLINE_LIVE_${p.id.toUpperCase()}`;
    const raw = process.env[envKey];
    if (!raw) {
      it.skip(`${p.name}: BLOCKED — ${envKey} not provided`, () => {});
      record(`${p.id}.identity`, "BLOCKED", { reason: `No sandbox credentials (${envKey})` });
      continue;
    }
    it(`${p.name}: identity against the sandbox account`, async () => {
      await live(
        `${p.id}.identity`,
        async () => {
          const fields = JSON.parse(raw) as Record<string, string>;
          const creds: Credentials = p.authType === "oauth2" ? { type: "oauth2", token: fields.token } : credentialsFromFields(p, fields);
          const signal = AbortSignal.timeout(20_000);
          const who = await p.identity({ http: createProviderHttp(p, creds, signal), credentials: creds, signal, log: () => {} });
          expect(who.accountId).toBeTruthy();
          return who;
        },
        (w) => ({ account: w.label }),
      );
    }, 30_000);
  }
});
