import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_MAX, integrationConnections, MIN_POOL_MAX, PG_MAX_CONNECTIONS, PG_RESERVED_CONNECTIONS, selectGateSteps, shouldUseNativeBrowserRunner, stackConnections, stackPoolMax } from "../../scripts/gate-selection.mjs";

const ALL = ["lint", "build", "stack", "chromium", "firefox", "webkit"];
const BROWSERS = ["chromium", "firefox", "webkit"];
const select = (over: Partial<Parameters<typeof selectGateSteps>[0]> = {}) => selectGateSteps({
  all: ALL,
  browsers: BROWSERS,
  only: ["firefox"],
  skip: [],
  tier: "fast",
  browserStacks: 3,
  browsersMode: "sequential",
  ...over,
});

describe("native Playwright browser runner", () => {
  it("uses installed browsers on Windows and when explicitly enabled in CI", () => {
    expect(shouldUseNativeBrowserRunner("win32", {})).toBe(true);
    expect(shouldUseNativeBrowserRunner("linux", { FLOWLINE_GATE_NATIVE_BROWSERS: "1" })).toBe(true);
  });

  it("keeps the Docker browser runner as the Linux default", () => {
    expect(shouldUseNativeBrowserRunner("linux", {})).toBe(false);
  });
});

describe("gate browser prerequisites", () => {
  it("selects one build for browser-only multi-stack runs", () => {
    const { selected, stackCount } = select();
    expect(stackCount).toBe(3);
    expect([...selected]).toEqual(["firefox", "stack", "build"]);
  });

  it("does not add a redundant build for a one-stack group", () => {
    const { selected, stackCount } = select({ browserStacks: 1 });
    expect(stackCount).toBe(1);
    expect(selected.has("stack")).toBe(true);
    expect(selected.has("build")).toBe(false);
  });

  it("accounts for multiple parallel project stacks when selecting build", () => {
    const { selected, stackCount, parallelProjects } = select({
      only: ["firefox", "webkit"],
      browsersMode: "parallel",
      browserStacks: 1,
    });
    expect(parallelProjects).toEqual(["firefox", "webkit"]);
    expect(stackCount).toBe(2);
    expect(selected.has("build")).toBe(true);
  });

  it("rejects skipping the shared build when multiple browser stacks are required", () => {
    expect(() => select({ skip: ["build"] })).toThrow(/multiple browser stacks require the build step/);
  });
});

describe("gate Postgres connection budget (docker-compose max_connections=50)", () => {
  const BUDGET = PG_MAX_CONNECTIONS - PG_RESERVED_CONNECTIONS;
  const poolFor = (stackCount: number) => stackPoolMax(stackCount) ?? DEFAULT_POOL_MAX;
  const totalStacks = (browserStacks: number, tier: "fast" | "full", browsersMode: "sequential" | "parallel") =>
    selectGateSteps({ all: ["build", "stack", ...BROWSERS], browsers: BROWSERS, only: [], skip: [], tier, browserStacks, browsersMode }).stackCount;

  it("keeps every tier under the budget for every allowed --stacks (1..6)", () => {
    for (let k = 1; k <= 6; k++) {
      const fast = totalStacks(k, "fast", "sequential");
      expect(fast).toBe(k);
      expect(stackConnections(fast, poolFor(fast))).toBeLessThanOrEqual(BUDGET);
      const fullSequential = totalStacks(k, "full", "sequential");
      expect(stackConnections(fullSequential, poolFor(fullSequential))).toBeLessThanOrEqual(BUDGET);
      // The parallel full tier runs Chromium K + Firefox ceil(K/2) + WebKit ceil(K/2) stacks at once; either every pool
      // still fits or the gate refuses that --stacks value before starting any stack (never "too many clients").
      const parallel = totalStacks(k, "full", "parallel");
      expect(parallel).toBe(k + 2 * Math.ceil(k / 2));
      try {
        expect(stackConnections(parallel, poolFor(parallel))).toBeLessThanOrEqual(BUDGET);
      } catch (e) {
        expect(String((e as Error).message)).toMatch(/at most \d+ stacks fit/);
        expect(stackConnections(parallel, MIN_POOL_MAX)).toBeGreaterThan(BUDGET);
      }
    }
  });

  it("the default full parallel tier (4 + 2 + 2 = 8 stacks) fits — previously 8 × 9 = 72 connections", () => {
    const pool = stackPoolMax(8);
    expect(pool).not.toBeNull();
    expect(pool!).toBeGreaterThanOrEqual(MIN_POOL_MAX);
    expect(stackConnections(8, pool!)).toBeLessThanOrEqual(BUDGET);
  });

  it("small counts keep the default pool; larger ones shrink it; impossible ones are refused with the largest count that fits", () => {
    expect(stackPoolMax(1)).toBeNull();
    expect(stackPoolMax(2)).toBeNull();
    expect(stackPoolMax(4)).toBe(4); // the fast-tier default, unchanged
    expect(stackPoolMax(6)).toBe(2); // --stacks=6 exhausted the server with pool 4 (6 × 9 = 54, GATE-03); now 6 × 5 = 30
    expect(() => stackPoolMax(12)).toThrow(/12 test stacks need more than the 40 Postgres connections available.*at most 8 stacks fit/);
    expect(stackPoolMax(100, { maxConnections: 2000, reserved: 0 })).toBeNull(); // 20 per stack → pool 9 ≥ default 8
    expect(stackPoolMax(100, { maxConnections: 1000, reserved: 0 })).toBe(4); // 10 per stack → (10 − 1) / 2
  });

  it("the integration shards are not in the stack budget, so the gate starts the stacks only after integration", () => {
    // Default fast tier: 4 stacks × (2 × 4 + 1) = 36 plus 4 shards × (8 + 1) = 36 would exceed max_connections=50.
    const stacks = stackConnections(4, poolFor(4));
    expect(integrationConnections(4)).toBe(36);
    expect(stacks + integrationConnections(4)).toBeGreaterThan(PG_MAX_CONNECTIONS);
    expect(stacks).toBeLessThanOrEqual(BUDGET);
    // scripts/gate.mjs therefore awaits the integration step before startStacks(); the two never share the server.
    const gate = readFileSync(new URL("../../scripts/gate.mjs", import.meta.url), "utf8");
    const awaitIntegration = gate.indexOf("await integration;");
    const startStacks = gate.indexOf("await startStacks()");
    expect(awaitIntegration).toBeGreaterThan(-1);
    expect(startStacks).toBeGreaterThan(awaitIntegration);
  });
});
