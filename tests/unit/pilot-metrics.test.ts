import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatMetricsAsMarkdown,
  isMainModule,
  NOT_LOGGED_DENIALS,
  NOT_TRACKED_ARABIC,
  NOT_TRACKED_UPTIME,
  parseRange,
  UsageError,
  type PilotMetrics,
} from "../../scripts/pilot-metrics";

const FROM = new Date("2026-10-16T00:00:00Z");
const TO = new Date("2026-10-23T23:59:59.999Z");

const empty: PilotMetrics = {
  signups: 0,
  medianHoursToVerified: null,
  onboardingAndWorkspaceDay1: 0,
  publishedFlowWithin3Days: 0,
  runSuccessRate: null,
  p95QueueToStartMs: null,
  webhookRuns: 0,
  scheduledRuns: 0,
  approvals: 0,
  duplicateWebhookRuns: 0,
};

const rows = (md: string) => md.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("| Metric") && !l.startsWith("|--"));

describe("pilot-metrics: parseRange", () => {
  it("reads an inclusive UTC day range", () => {
    const r = parseRange(["--from", "2026-10-16", "--to", "2026-10-23"]);
    expect(r.from.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-23T23:59:59.999Z");
  });

  it.each([
    [["--from", "2026-10-16"], "missing --to"],
    [["--to", "2026-10-16"], "missing --from"],
    [["--from", "2026-10-16", "--to", "tomorrow"], "not a date"],
    [["--from", "2026-02-30", "--to", "2026-03-05"], "nonexistent day JS would roll over"],
    [["--from", "2026-10-23", "--to", "2026-10-16"], "reversed range"],
  ])("rejects %j (%s) with a UsageError", (argv) => {
    expect(() => parseRange(argv)).toThrow(UsageError);
  });
});

describe("pilot-metrics: formatMetricsAsMarkdown", () => {
  it("prints every row on an empty range without crashing", () => {
    const md = formatMetricsAsMarkdown(empty, FROM, TO);
    expect(rows(md)).toHaveLength(13);
    expect(md).toContain("| Sign-ups | 0 |");
    expect(md).toContain("| Median time to verified | N/A |");
    expect(md).toContain("| Run success rate | N/A |");
    expect(md).toContain("| Scheduled runs | 0 |");
    expect(md).toContain("| Duplicate webhook runs | 0 |");
    expect(md).toContain(NOT_TRACKED_UPTIME);
    expect(md).not.toMatch(/\|[ \t]*\|/); // no empty cell
  });

  it("shows a 0% success rate as 0.0%, not N/A (every finished run failed)", () => {
    expect(formatMetricsAsMarkdown({ ...empty, runSuccessRate: 0 }, FROM, TO)).toContain("| Run success rate | 0.0% |");
  });

  it("formats a fractional rate and says plainly what is not recorded", () => {
    const md = formatMetricsAsMarkdown({ ...empty, runSuccessRate: 0.8, scheduledRuns: 3 }, FROM, TO);
    expect(md).toContain("| Run success rate | 80.0% |");
    expect(md).toContain("| Scheduled runs | 3 |");
    expect(md).toContain(NOT_LOGGED_DENIALS);
    expect(md).toContain(NOT_TRACKED_ARABIC);
    expect(md).toContain(NOT_TRACKED_UPTIME);
  });
});

describe("pilot-metrics: CLI", () => {
  it("detects direct execution by real path, even for relative paths and spaces", () => {
    const abs = path.resolve("scripts/pilot-metrics.ts");
    expect(isMainModule(pathToFileURL(abs).href, abs)).toBe(true);
    expect(isMainModule(pathToFileURL(abs).href, "scripts/pilot-metrics.ts")).toBe(true);
    expect(isMainModule(pathToFileURL("/tmp/my dir/pilot-metrics.ts").href, "/tmp/my dir/pilot-metrics.ts")).toBe(true);
    expect(isMainModule(pathToFileURL(abs).href, "scripts/other.ts")).toBe(false);
    expect(isMainModule(pathToFileURL(abs).href, undefined)).toBe(false);
  });

  it("exits non-zero with a usage message on stderr for a reversed range, before touching the DB", () => {
    const tsx = path.resolve("node_modules/.bin/tsx");
    const r = spawnSync(tsx, ["scripts/pilot-metrics.ts", "--from", "2026-10-23", "--to", "2026-10-16"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage: pilot-metrics.ts --from YYYY-MM-DD --to YYYY-MM-DD");
    expect(r.stdout).toBe("");
  });
});
