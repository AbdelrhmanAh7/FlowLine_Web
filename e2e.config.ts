// tester-army/e2e (npm `e2e`): the natural-language E2E suite in e2e-army/, run by `pnpm e2e:army` (scripts/e2e-army.mjs).
// Same setup as the hub's runner (ops/verify/e2e-army/e2e.config.ts): headless Chromium, one worker, replay cache on
// (.e2e/cache, so a repeat run on an unchanged UI replays recorded actions without a model), telemetry off.
//   E2E_ARMY_URL   an app that is already running; unset: the runner starts the isolated test stack (scripts/dev-test.mjs,
//                  .env.test, FLOWLINE_ENV=test) on :3100 and stops it at the end
//   E2E_ARMY_CLI   agy (Gemini Flash through the owner's agy login, free) | claude (Haiku); unset: no model, agent tests skip
// No key or secret is read here: the model CLIs use their own logins.
import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

process.env.E2E_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";

const url = process.env.E2E_ARMY_URL ?? "http://localhost:3100";
const app = process.env.E2E_ARMY_URL
  ? { url, identity: "flowline-web" }
  : {
      url,
      identity: "flowline-web",
      readyUrl: `${url}/api/health?require=worker`,
      // `next dev` compiles on the first request; reuse a stack `pnpm dev:test` already started.
      command: { executable: "node", args: ["scripts/dev-test.mjs"], startupTimeout: 180_000, reuseExisting: true, log: ".e2e/logs/test-stack.log" },
    };

const cli = process.env.E2E_ARMY_CLI;
const agents =
  cli === "agy" || cli === "claude"
    ? { default: { model: (await import("./e2e-army/cli-model")).cliModel({ cli }), maxModelCalls: 14, maxSteps: 14, judgmentTimeout: 90_000 } }
    : undefined;

export default {
  targets: [{ engine: web(), app }],
  tests: ["e2e-army/**/*.e2e.ts"],
  output: process.env.E2E_ARMY_OUT ?? ".e2e",
  workers: 1,
  retries: 0,
  cache: "read-write",
  timeout: 150_000,
  ...(agents ? { agents } : {}),
} satisfies E2EConfig;
