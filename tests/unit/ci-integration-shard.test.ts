import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { failSetup, parseShard, parseVitestTotals, shardStatus, shardSummary, startShard } from "../../scripts/ci/integration-shard.mjs";

// scripts/ci/integration-shard.mjs gives every integration shard of the CI Gate its own summary.json, vitest log and progress.log
// (the static leg's come from `pnpm gate`). These tests run the real runner against a fake command, never against vitest or a database.
const script = fileURLToPath(new URL("../../scripts/ci/integration-shard.mjs", import.meta.url));
const identity = { sha: "0123456789abcdef0123456789abcdef01234567", shortSha: "0123456", dirty: false, dirtyCount: 0, node: "v22.0.0", pnpm: "10.32.1" };
const shard = parseShard("2/3");
const fake = (code: string) => ({ command: process.execPath, args: ["-e", code] });
const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");
const summaryOf = (dir: string) => JSON.parse(read(dir, "summary.json"));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flowline-shard-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("parseShard", () => {
  it("accepts k/N and derives a name that is safe in file and artifact names", () => {
    expect(parseShard("1/3")).toEqual({ index: 1, total: 3, label: "1/3", slug: "1of3" });
    expect(parseShard("16/16").slug).toBe("16of16");
  });

  it.each(["", "3", "0/3", "4/3", "1/0", "1/17", "01/3", "1/03", "a/b", "1/3/4", "-1/3", " 1/3", "1/3 ", "1.5/3"])("rejects %j", (value) => {
    expect(() => parseShard(value)).toThrow(/--shard must look like k\/N/);
  });

  it("rejects a missing value", () => {
    expect(() => parseShard(undefined)).toThrow(/--shard/);
  });
});

describe("parseVitestTotals and shardStatus", () => {
  it("reads the vitest summary line, colours included, and ignores the Test Files line", () => {
    const colored = "\u001b[2m Test Files \u001b[22m \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m | 20 passed (21)\n\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[31m3 failed\u001b[39m\u001b[22m | \u001b[1m\u001b[32m120 passed\u001b[39m\u001b[22m | 2 skipped\u001b[90m (125)\u001b[39m\n";
    expect(parseVitestTotals(colored)).toEqual({ failed: 3, passed: 120, skipped: 2 });
    expect(parseVitestTotals("      Tests  14 passed (14)\n")).toEqual({ passed: 14 });
  });

  it("returns null when there is no test summary", () => {
    expect(parseVitestTotals("")).toBeNull();
    expect(parseVitestTotals("Error: global setup failed\n Test Files  1 failed (1)\n")).toBeNull();
  });

  it("passes only on exit 0 with a summary and no failures", () => {
    expect(shardStatus(0, { passed: 5 })).toBe("pass");
    expect(shardStatus(0, { passed: 5, failed: 0, skipped: 1 })).toBe("pass");
    expect(shardStatus(0, null)).toBe("fail");
    expect(shardStatus(0, { passed: 4, failed: 1 })).toBe("fail");
    expect(shardStatus(1, { passed: 5 })).toBe("fail");
    expect(shardStatus(127, null)).toBe("fail");
  });
});

describe("shardSummary", () => {
  it("names the shard and uses the shape scripts/gate.mjs writes", () => {
    const step = { name: "integration 2/3", phase: 2, status: "pass", rc: 0, durationMs: 1200, log: "x.log", totals: { passed: 3 } };
    const summary = shardSummary({ identity, tier: "fast", shard, out: "artifacts/gates/x", startedAt: "2026-10-08T00:00:00.000Z", finishedAt: "2026-10-08T00:00:02.000Z", step });
    expect(summary).toMatchObject({ sha: identity.sha, tier: "fast", shard: "2/3", integrationShards: 3, group: null, failFast: false, out: "artifacts/gates/x", ok: true, steps: [step] });
    expect(shardSummary({ identity, tier: "fast", shard, out: "x", startedAt: "a", finishedAt: "b", step: { ...step, status: "fail" } }).ok).toBe(false);
  });
});

describe("startShard", () => {
  it("writes the shard's own summary.json, vitest log and progress.log on a pass", async () => {
    const { done } = startShard({ shard, out: dir, ...fake("console.log('running'); console.log('      Tests  7 passed | 1 skipped (8)')"), identity, echo: false });
    const { summary, rc } = await done;
    expect(rc).toBe(0);
    expect(summaryOf(dir)).toEqual(summary);
    expect(summary).toMatchObject({ ok: true, shard: "2/3", tier: "fast", sha: identity.sha, integrationShards: 3 });
    expect(summary.finishedAt).not.toBeNull();
    expect(summary.steps).toHaveLength(1);
    expect(summary.steps[0]).toMatchObject({ name: "integration 2/3", status: "pass", rc: 0, totals: { passed: 7, skipped: 1 } });
    expect(summary.steps[0].log).toBe(join(dir, "integration-2of3.log"));
    expect(read(dir, "integration-2of3.log")).toContain("running");
    const progress = read(dir, "progress.log");
    expect(progress).toMatch(/START integration 2\/3/);
    expect(progress).toMatch(/END integration 2\/3 rc=0/);
    expect(progress).toMatch(/GATE PASS/);
  });

  it("fails the shard when a test fails, keeping the totals and the full output", async () => {
    const { done } = startShard({ shard: parseShard("1/3"), out: dir, ...fake("console.error('boom in test'); console.log('      Tests  1 failed | 6 passed (7)'); process.exit(1)"), identity, echo: false });
    const { summary, rc } = await done;
    expect(rc).toBe(1);
    expect(summary.ok).toBe(false);
    expect(summary.steps[0]).toMatchObject({ name: "integration 1/3", status: "fail", rc: 1, totals: { failed: 1, passed: 6 } });
    expect(read(dir, "integration-1of3.log")).toContain("boom in test");
    expect(read(dir, "progress.log")).toMatch(/GATE FAIL/);
  });

  it("does not count exit 0 without a test summary as a pass", async () => {
    const { done } = startShard({ shard, out: dir, ...fake("console.log('nothing to report')"), identity, echo: false });
    const { summary, rc } = await done;
    expect(rc).toBe(1);
    expect(summary.ok).toBe(false);
    expect(summary.steps[0]).toMatchObject({ status: "fail", rc: 0, totals: null });
    expect(summary.steps[0].note).toMatch(/no test summary/);
  });

  it("explains a failure that happened before any test ran", async () => {
    const { done } = startShard({ shard, out: dir, ...fake("console.error('global setup failed'); process.exit(1)"), identity, echo: false });
    const { summary, rc } = await done;
    expect(rc).toBe(1);
    expect(summary.steps[0]).toMatchObject({ status: "fail", rc: 1, totals: null });
    expect(summary.steps[0].note).toMatch(/stopped before running tests/);
    expect(summary.steps[0].note).toContain(join(dir, "integration-2of3.log"));
  });

  it("leaves an unfinished, failed summary while the shard runs, never a missing one", async () => {
    const { done } = startShard({ shard, out: dir, ...fake("setTimeout(() => console.log('      Tests  1 passed (1)'), 400)"), identity, echo: false });
    const early = summaryOf(dir);
    expect(early).toMatchObject({ ok: false, shard: "2/3", finishedAt: null });
    expect(early.steps[0]).toMatchObject({ name: "integration 2/3", status: "incomplete", rc: null });
    expect(early.steps[0].note).toMatch(/killed, cancelled or timed out/);
    expect((await done).summary.ok).toBe(true);
    expect(summaryOf(dir).ok).toBe(true);
  });

  it("reports a shard killed by a signal as failed, with the signal in the note", async () => {
    const { done } = startShard({ shard, out: dir, ...fake("console.log('started'); process.kill(process.pid, 'SIGKILL')"), identity, echo: false });
    const { summary, rc } = await done;
    expect(rc).toBe(1);
    expect(summary.ok).toBe(false);
    expect(summary.steps[0]).toMatchObject({ status: "fail", rc: 128 });
    expect(summary.steps[0].note).toMatch(/killed by SIGKILL/);
    expect(summaryOf(dir).steps[0].status).toBe("fail");
  });

  it("reports a command that cannot start as failed", async () => {
    const { done } = startShard({ shard, out: dir, command: join(dir, "no-such-command"), args: [], identity, echo: false });
    const { summary, rc } = await done;
    expect(rc).toBe(1);
    expect(summary.steps[0]).toMatchObject({ status: "fail", rc: 127 });
    expect(summary.steps[0].note).toMatch(/could not start/);
  });

  it("two shards in two directories never share a report", async () => {
    const other = mkdtempSync(join(tmpdir(), "flowline-shard-"));
    try {
      const a = startShard({ shard: parseShard("1/3"), out: dir, ...fake("console.log('      Tests  1 passed (1)')"), identity, echo: false });
      const b = startShard({ shard: parseShard("3/3"), out: other, ...fake("console.log('      Tests  1 failed (1)'); process.exit(1)"), identity, echo: false });
      await Promise.all([a.done, b.done]);
      expect(summaryOf(dir)).toMatchObject({ shard: "1/3", ok: true });
      expect(summaryOf(other)).toMatchObject({ shard: "3/3", ok: false });
      expect(existsSync(join(dir, "integration-3of3.log"))).toBe(false);
      expect(existsSync(join(other, "integration-1of3.log"))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("failSetup", () => {
  it("leaves a failed summary for a shard whose environment could not be prepared", () => {
    const summary = failSetup({ shard, out: dir, message: ".env.test not found", identity });
    expect(summaryOf(dir)).toEqual(summary);
    expect(summary).toMatchObject({ ok: false, shard: "2/3" });
    expect(summary.steps[0]).toMatchObject({ name: "integration 2/3", status: "fail", rc: 2 });
    expect(summary.steps[0].note).toContain(".env.test not found");
  });
});

describe("integration-shard CLI", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, GATE_TIER: "" } });

  it.each([
    [["--shard=4/3", "--out=x"], /--shard must look like k\/N/],
    [["--shard=1/3"], /--out=<dir> is required/],
    [["--out=x"], /--shard must look like k\/N/],
    [["--shard=1/3", "--out=x", "--tier=slow"], /--tier must be fast or full/],
    [["--shard=1/3", "--out=x", "--bogus=1"], /unknown argument "--bogus=1"/],
    [["--shard=1/3", "--out=x", "stray"], /unknown argument "stray"/],
  ])("rejects bad arguments %j with exit 2 and one error line, before touching a database", (args, message) => {
    const result = run(...args);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(message);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toMatch(/^::error::Integration shard failed: /);
    expect(existsSync(join(process.cwd(), "x"))).toBe(false);
  });
});
