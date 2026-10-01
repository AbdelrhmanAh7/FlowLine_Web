// Single source of truth for ONE isolated E2E test stack's ports, URLs and database. Used by scripts/dev-test.mjs,
// scripts/stop-test-stack.mjs, scripts/gate.mjs, playwright.config.ts and the specs (through e2e/stack.ts), so several
// stacks (one per Playwright shard) can run side by side, each with its own app port, fake ports and database:
//   FLOWLINE_TEST_PORT       app (next) port            default 3100
//   FLOWLINE_TEST_FAKE_PORT  fake SaaS providers port   default: port of FLOWLINE_PROVIDER_OVERRIDE, else 4010
//   FLOWLINE_TEST_AI_PORT    fake AI provider port      default: port of FLOWLINE_AI_TEST_OVERRIDE, else 4011
//   FLOWLINE_TEST_DB         database name              default: the name in DATABASE_URL (flowline_test)
// The database name must match flowline_test or flowline_test_<suffix> — a stack never touches the dev database.
// CommonJS (not .mjs) so Playwright's TypeScript loader can require it on every Node version; types in test-stack.d.cts.
"use strict";

const DB_NAME = /^flowline_test(_[a-z0-9]+)?$/;

function portOf(url, fallback) {
  try {
    return Number(new URL(url).port) || fallback;
  } catch {
    return fallback;
  }
}

function portVar(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name}=${raw} is not a TCP port`);
  return n;
}

function dbNameOf(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || null;
  } catch {
    return null;
  }
}

/** The stack described by `env` (FLOWLINE_TEST_* plus .env.test's values). Pure: reads `env`, never writes it. */
function testStack(env = process.env) {
  const port = portVar(env, "FLOWLINE_TEST_PORT", 3100);
  const fakePort = portVar(env, "FLOWLINE_TEST_FAKE_PORT", portOf(env.FLOWLINE_PROVIDER_OVERRIDE, 4010));
  const aiPort = portVar(env, "FLOWLINE_TEST_AI_PORT", portOf(env.FLOWLINE_AI_TEST_OVERRIDE, 4011));
  const db = env.FLOWLINE_TEST_DB || dbNameOf(env.DATABASE_URL) || "flowline_test";
  if (!DB_NAME.test(db)) throw new Error(`test stack database "${db}" must match ${DB_NAME} (never the dev database)`);
  return {
    port,
    fakePort,
    aiPort,
    db,
    /** The app as the browser sees it (cookies, origin header). */
    baseUrl: `http://localhost:${port}`,
    fakeUrl: `http://127.0.0.1:${fakePort}`,
    aiUrl: `http://127.0.0.1:${aiPort}`,
    healthUrl: `http://localhost:${port}/api/health?require=worker`,
    /** Set by a sharded run (e.g. "2"); "" otherwise. Used only to keep output paths apart. */
    shard: env.FLOWLINE_TEST_SHARD || "",
  };
}

/**
 * Writes the stack's derived settings into `env` (default process.env): DATABASE_URL (database name replaced),
 * BETTER_AUTH_URL, FLOWLINE_PUBLIC_URL, FLOWLINE_PROVIDER_OVERRIDE, FLOWLINE_AI_TEST_OVERRIDE, FAKE_*_WEBHOOK_URL and the
 * fake entries of FLOWLINE_EGRESS_ALLOWLIST. Call it after loading .env.test. With no FLOWLINE_TEST_* set, every value is
 * the one .env.test already holds. Returns the stack.
 */
function applyTestStackEnv(env = process.env) {
  const s = testStack(env);
  // The application root .env is also auto-loaded by Next during test builds. Never let the local owner's
  // operator-managed ZITADEL app credentials bleed into an isolated test stack, even if caller env overrides .env.test.
  for (const key of ["ZITADEL_ISSUER", "ZITADEL_CLIENT_ID", "ZITADEL_CLIENT_SECRET"]) env[key] = "";
  if (env.DATABASE_URL) {
    const u = new URL(env.DATABASE_URL);
    u.pathname = `/${s.db}`;
    env.DATABASE_URL = u.toString();
  }
  // The fakes' old host:port (from .env.test) in the egress allowlist become the stack's own; other entries are kept.
  const hostPort = (url, fallback) => {
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port}`;
    } catch {
      return fallback;
    }
  };
  const swap = new Map([
    [hostPort(env.FLOWLINE_PROVIDER_OVERRIDE, "127.0.0.1:4010"), `127.0.0.1:${s.fakePort}`],
    [hostPort(env.FLOWLINE_AI_TEST_OVERRIDE, "127.0.0.1:4011"), `127.0.0.1:${s.aiPort}`],
  ]);
  if (env.FLOWLINE_EGRESS_ALLOWLIST) {
    env.FLOWLINE_EGRESS_ALLOWLIST = env.FLOWLINE_EGRESS_ALLOWLIST.split(",")
      .map((e) => swap.get(e.trim()) ?? e.trim())
      .join(",");
  }
  env.BETTER_AUTH_URL = s.baseUrl;
  env.FLOWLINE_PUBLIC_URL = s.baseUrl;
  env.FLOWLINE_PROVIDER_OVERRIDE = s.fakeUrl;
  // AI hub test double: honoured only with FLOWLINE_ENV=test; the owner still enters a key in the UI.
  env.FLOWLINE_AI_TEST_OVERRIDE = s.aiUrl;
  // The fake billing providers deliver signed webhooks to the app over loopback.
  env.FAKE_STRIPE_WEBHOOK_URL = `http://127.0.0.1:${s.port}/api/billing/webhook`;
  env.FAKE_PADDLE_WEBHOOK_URL = `http://127.0.0.1:${s.port}/api/billing/webhook`;
  return s;
}

module.exports = { testStack, applyTestStackEnv, DB_NAME };
