import { afterAll, beforeAll, describe, it } from "vitest";
import { startFakeProviders } from "../../e2e/fakes/provider-server";
import type { ProviderId } from "@/integrations/types";
import { buildSession, DRYRUN } from "./certify/framework";
import { SCENARIOS } from "./certify/scenarios";

/**
 * REL-LIVE-SUITE: live/sandbox certification for every SaaS adapter.
 *
 * Real mode (pnpm test:live:saas, env from .env): each provider runs against its real
 * sandbox account when FLOWLINE_LIVE_<PROVIDER> credentials exist; otherwise every check
 * is recorded BLOCKED. Results → artifacts/phase-3/live-results.json.
 *
 * Dry-run mode (pnpm test:live:dryrun, FLOWLINE_LIVE_DRYRUN=1): the same scenario code
 * runs against the in-process provider test double (loopback only, fake tokens).
 * Results → artifacts/phase-3/live-dryrun-results.json as DRYRUN_PASS/DRYRUN_FAIL/N/A.
 */
let fake: { close(): Promise<void> } | undefined;

beforeAll(async () => {
  if (!DRYRUN) return;
  const server = await startFakeProviders();
  process.env.FLOWLINE_ENV = "test";
  process.env.FLOWLINE_PROVIDER_OVERRIDE = server.url;
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${server.port},localhost:${server.port}`;
  fake = server;
});

afterAll(async () => {
  await fake?.close();
});

describe(`SaaS certification (${DRYRUN ? "dry-run against the test double" : "live sandboxes"})`, () => {
  for (const [id, scenario] of Object.entries(SCENARIOS)) {
    it(`${id}: connect/identity/read/write/verify/cleanup/revocation/errors`, async () => {
      const session = buildSession(id as ProviderId);
      await scenario(session);
      session.assertAllPassed();
    }, 120_000);
  }
});
