/** Pure gate selection helpers so prerequisite selection can be regression-tested without starting a gate. */
export function selectGateSteps({ all, browsers, only, skip, tier, browserStacks, browsersMode }) {
  const selected = new Set(
    all.filter((name) => (only.length === 0 || only.includes(name)) && !skip.includes(name)).filter(
      (name) => tier === "full" || only.includes(name) || !["firefox", "webkit"].includes(name),
    ),
  );
  const hasBrowser = browsers.some((name) => selected.has(name));
  if (hasBrowser && !skip.includes("stack")) selected.add("stack");

  const parallelProjects = browsersMode === "parallel" ? browsers.filter((name) => selected.has(name)) : [];
  const stackCount = parallelProjects.length > 1
    ? parallelProjects.reduce((count, name) => count + (name === "chromium" ? browserStacks : Math.ceil(browserStacks / 2)), 0)
    : browserStacks;

  if (hasBrowser && selected.has("stack") && stackCount > 1) {
    if (skip.includes("build")) throw new Error("multiple browser stacks require the build step; omit --skip=build or use --stacks=1");
    selected.add("build");
  }
  return { selected, parallelProjects, stackCount };
}

/** Use installed Playwright browsers on Windows, or when CI explicitly requests native browsers. */
export function shouldUseNativeBrowserRunner(platform = process.platform, env = process.env) {
  return platform === "win32" || env.FLOWLINE_GATE_NATIVE_BROWSERS === "1";
}

/** docker-compose.yml caps the test Postgres at max_connections=50 (superuser_reserved_connections=3 of them). */
export const PG_MAX_CONNECTIONS = 50;
/**
 * Kept free of stacks: 3 superuser-reserved + Playwright fixtures and psql. The integration shards are NOT part of this
 * budget (N shards × (pool 8 + a global-setup client) = 36 at --shards=4 would leave no room for the stacks), so
 * scripts/gate.mjs starts the stacks only after the integration step has finished; the two never share the server.
 */
export const PG_RESERVED_CONNECTIONS = 10;
/** Connections the integration step can hold: each shard's vitest process keeps one default pool plus the global-setup client. */
export const integrationConnections = (shards, poolMax = DEFAULT_POOL_MAX) => shards * (poolMax + 1);
/** The pool size src/db/index.ts uses when FLOWLINE_DB_POOL_MAX is unset. */
export const DEFAULT_POOL_MAX = 8;
/** The smallest pool a stack can run on (a transaction plus one concurrent query must never deadlock on the pool). */
export const MIN_POOL_MAX = 2;

/** Connections one stack can hold: two pools (next + worker) of `poolMax` plus the worker's LISTEN connection. */
export const stackConnections = (stackCount, poolMax) => stackCount * (2 * poolMax + 1);

/**
 * Pool size for `stackCount` isolated stacks under the Postgres connection budget, for EVERY tier (fast: K stacks;
 * full parallel: K + ceil(K/2) + ceil(K/2)). Returns null when the default pool already fits. Throws when the stacks
 * cannot fit even with the smallest pool, naming the largest count that does.
 */
export function stackPoolMax(stackCount, { maxConnections = PG_MAX_CONNECTIONS, reserved = PG_RESERVED_CONNECTIONS, defaultPool = DEFAULT_POOL_MAX, minPool = MIN_POOL_MAX } = {}) {
  const budget = maxConnections - reserved;
  const perStack = Math.floor(budget / stackCount);
  const pool = Math.floor((perStack - 1) / 2);
  if (pool < minPool) {
    const most = Math.floor(budget / (2 * minPool + 1));
    throw new Error(`${stackCount} test stacks need more than the ${budget} Postgres connections available (max_connections=${maxConnections} in docker-compose.yml, ${reserved} reserved); at most ${most} stacks fit — lower --stacks or use --browsers=sequential`);
  }
  return pool >= defaultPool ? null : pool;
}
