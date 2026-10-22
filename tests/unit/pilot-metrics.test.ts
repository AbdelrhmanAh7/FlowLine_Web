import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectPilotMetrics,
  formatMetricsAsMarkdown,
  getDuplicateWebhookRuns,
  getScheduledRuns,
  isMainModule,
  NOT_LOGGED_DENIALS,
  NOT_TRACKED_ARABIC,
  NOT_TRACKED_UPTIME,
  parseRange,
  type Queryable,
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
  it("AC2 & AC3: prints every row on an empty range without crashing (all 13 metrics)", () => {
    const md = formatMetricsAsMarkdown(empty, FROM, TO);
    expect(rows(md)).toHaveLength(13);
    expect(md).toContain("| Sign-ups | 0 |");
    expect(md).toContain("| Median time to verified | N/A |");
    expect(md).toContain("| Run success rate | N/A |");
    expect(md).toContain("| Webhook runs | 0 |");
    expect(md).toContain("| Scheduled runs | 0 |");
    expect(md).toContain("| Approvals (workflow) | 0 |");
    expect(md).toContain("| Duplicate webhook runs | 0 |");
    expect(md).toContain("| Cross-workspace access denials | " + NOT_LOGGED_DENIALS + " |");
    expect(md).toContain("| Share of users who switched to Arabic | " + NOT_TRACKED_ARABIC + " |");
    expect(md).toContain("| Staging uptime | " + NOT_TRACKED_UPTIME + " |");
    expect(md).not.toMatch(/\|[ \t]*\|/); // no empty cell
  });

  it("AC2: formats scheduled runs count in markdown", () => {
    const md = formatMetricsAsMarkdown({ ...empty, scheduledRuns: 7 }, FROM, TO);
    expect(md).toContain("| Scheduled runs | 7 |");
  });

  it("AC1: formats duplicate webhook runs count in markdown", () => {
    const md = formatMetricsAsMarkdown({ ...empty, duplicateWebhookRuns: 3 }, FROM, TO);
    expect(md).toContain("| Duplicate webhook runs | 3 |");
  });

  it("formats run success rate as 0.0%, 100.0%, or fractional percentage", () => {
    expect(formatMetricsAsMarkdown({ ...empty, runSuccessRate: 0 }, FROM, TO)).toContain("| Run success rate | 0.0% |");
    expect(formatMetricsAsMarkdown({ ...empty, runSuccessRate: 1.0 }, FROM, TO)).toContain("| Run success rate | 100.0% |");
    expect(formatMetricsAsMarkdown({ ...empty, runSuccessRate: 0.85 }, FROM, TO)).toContain("| Run success rate | 85.0% |");
    expect(formatMetricsAsMarkdown({ ...empty, runSuccessRate: null }, FROM, TO)).toContain("| Run success rate | N/A |");
  });
  it("AC3: formats staging uptime metric using NOT_TRACKED_UPTIME documenting external /api/health probe", () => {
    const md = formatMetricsAsMarkdown(empty, FROM, TO);
    expect(md).toContain("| Staging uptime | " + NOT_TRACKED_UPTIME + " |");
    expect(NOT_TRACKED_UPTIME).toContain("/api/health");
  });
});

describe("pilot-metrics: collectPilotMetrics and queries", () => {
  it("AC4: propagates a 0 success rate from run metrics query to PilotMetrics", async () => {
    let callIndex = 0;
    const mockDb = {
      execute: async () => {
        callIndex++;
        if (callIndex === 1) return { rows: [{ signups: 0, median_hours_to_verified: null }] };
        if (callIndex === 2) return { rows: [{ count: 0 }] };
        if (callIndex === 3) return { rows: [{ count: 0 }] };
        if (callIndex === 4) return { rows: [{ success_rate: 0, p95_queue_to_start_ms: null }] };
        if (callIndex === 5) return { rows: [{ count: 0 }] };
        if (callIndex === 6) return { rows: [{ count: 0 }] };
        if (callIndex === 7) return { rows: [{ count: 0 }] };
        if (callIndex === 8) return { rows: [{ count: 0 }] };
        return { rows: [] };
      },
    } as unknown as Queryable;

    const metrics = await collectPilotMetrics(mockDb, FROM, TO);
    expect(metrics.runSuccessRate).toBe(0);
    const md = formatMetricsAsMarkdown(metrics, FROM, TO);
    expect(md).toContain("| Run success rate | 0.0% |");
  });

  it("AC1 & AC2: propagates scheduled runs and duplicate runs from queryable to PilotMetrics", async () => {
    let callIndex = 0;
    const mockDb = {
      execute: async () => {
        callIndex++;
        if (callIndex === 1) return { rows: [{ signups: 10, median_hours_to_verified: 1.5 }] };
        if (callIndex === 2) return { rows: [{ count: 8 }] };
        if (callIndex === 3) return { rows: [{ count: 6 }] };
        if (callIndex === 4) return { rows: [{ success_rate: 0.95, p95_queue_to_start_ms: 120 }] };
        if (callIndex === 5) return { rows: [{ count: 20 }] }; // webhook runs
        if (callIndex === 6) return { rows: [{ count: 12 }] }; // scheduled runs (Query 5b)
        if (callIndex === 7) return { rows: [{ count: 4 }] };  // approvals (Query 5c)
        if (callIndex === 8) return { rows: [{ count: 2 }] };  // duplicate webhook runs (Query 5d)
        return { rows: [] };
      },
    } as unknown as Queryable;

    const metrics = await collectPilotMetrics(mockDb, FROM, TO);
    expect(metrics.runSuccessRate).toBe(0.95);
    expect(metrics.webhookRuns).toBe(20);
    expect(metrics.scheduledRuns).toBe(12);
    expect(metrics.approvals).toBe(4);
    expect(metrics.duplicateWebhookRuns).toBe(2);

    const md = formatMetricsAsMarkdown(metrics, FROM, TO);
    expect(md).toContain("| Run success rate | 95.0% |");
    expect(md).toContain("| Scheduled runs | 12 |");
    expect(md).toContain("| Duplicate webhook runs | 2 |");
    expect(md).toContain("| Staging uptime | " + NOT_TRACKED_UPTIME + " |");
  });

  it("AC1: getDuplicateWebhookRuns executes query against Queryable", async () => {
    const mockDb = {
      execute: async () => ({ rows: [{ count: 3 }] }),
    } as unknown as Queryable;

    const res = await getDuplicateWebhookRuns(mockDb, FROM, TO);
    expect(res).toEqual({ count: 3 });
  });

  it("AC2: getScheduledRuns executes query against Queryable", async () => {
    const mockDb = {
      execute: async () => ({ rows: [{ count: 7 }] }),
    } as unknown as Queryable;

    const res = await getScheduledRuns(mockDb, FROM, TO);
    expect(res).toEqual({ count: 7 });
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
    const r = spawnSync(tsx, ["scripts/pilot-metrics.ts", "--from", "2026-10-23", "--to", "2026-10-16"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage: pilot-metrics.ts --from YYYY-MM-DD --to YYYY-MM-DD");
    expect(r.stdout).toBe("");
  });
});
