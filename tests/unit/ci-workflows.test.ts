import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// Text-level guards for .github/ (no YAML parser is a project dependency). They pin the invariants behind the required
// `gate` and `docs` checks on main; behaviour that depends on GitHub itself can only be verified by a live run.
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const workflowFiles = readdirSync(join(root, ".github/workflows")).filter((f) => f.endsWith(".yml")).map((f) => `.github/workflows/${f}`);
const actionFiles = readdirSync(join(root, ".github/actions")).map((dir) => `.github/actions/${dir}/action.yml`);
const allFiles = [...workflowFiles, ...actionFiles];
const gateFiles = [".github/workflows/gate.yml", ...actionFiles];

// Splits the `jobs:` mapping of a workflow into { id: block text } using the fixed two-space job indentation.
const jobs = (text: string): Record<string, string> => {
  const parts = text.slice(text.indexOf("\njobs:\n") + 7).split(/^ {2}([a-z][\w-]*):[ \t]*$/m);
  const result: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) result[parts[i]] = parts[i + 1];
  return result;
};
const stripComments = (text: string) => text.replace(/^\s*#.*$/gm, "");
const triggerTypes = (text: string, event: string) => {
  const match = new RegExp(`^ {2}${event}:\\n(?: {4}.*\\n)*? {4}types: \\[([^\\]]*)\\]`, "m").exec(text);
  return match ? match[1].split(",").map((type) => type.trim()) : null;
};

// A job's steps, parsed from the comment-stripped text (a commented-out line or a step name cannot count as a command).
// Each step starts at `      - ` (six spaces); its keys sit at eight spaces. `run` is the command, or the block under `run: |`.
type Step = { name?: string; uses?: string; run?: string; if?: string; raw: string };
const steps = (jobText: string): Step[] =>
  stripComments(jobText).split(/^ {6}- /m).slice(1).map((chunk) => {
    const raw = `        ${chunk}`; // the first key shares the `- ` line: put it at the same indent as the others
    const field = (key: string) => new RegExp(`^ {8}${key}:[ \\t]*(.*)$`, "m").exec(raw)?.[1].trim();
    const block = new RegExp("^ {8}run:[ \\t]*\\|[ \\t]*\\n((?: {10}.*\\n?|[ \\t]*\\n)*)", "m").exec(raw)?.[1];
    return { name: field("name"), uses: field("uses"), run: block !== undefined ? block.replace(/^ {10}/gm, "").trim() : field("run"), if: field("if"), raw };
  });

// The nightly job must be exactly: checkout, shared setup, create flowline_test, run the nightly project, in this order,
// with no condition and no continue-on-error on any step. Returns the problems found (empty when the job is right).
const nightlyProblems = (workflow: string): string[] => {
  const job = jobs(stripComments(workflow)).nightly;
  if (job === undefined) return ["no nightly job"];
  const all = steps(job);
  const problems: string[] = [];
  const [checkout, setup, createdb, run] = all;
  if (all.length !== 4) problems.push(`expected 4 steps, found ${all.length}`);
  if (!checkout?.uses?.startsWith("actions/checkout@") || !/^ {10}persist-credentials: false$/m.test(checkout.raw)) problems.push("step 1 is not checkout with persist-credentials: false");
  if (setup?.uses !== "./.github/actions/setup-gate" || !/^ {10}postgres: "true"$/m.test(setup.raw) || !/^ {10}sandbox-image: "true"$/m.test(setup.raw)) problems.push("step 2 is not setup-gate with postgres and sandbox-image");
  if (createdb?.run !== "docker exec flowline-ci-postgres createdb -U flowline flowline_test") problems.push("step 3 does not create flowline_test");
  if (run?.run !== "pnpm test:nightly") problems.push("step 4 does not run pnpm test:nightly");
  for (const [i, step] of all.entries()) {
    if (step.if !== undefined) problems.push(`step ${i + 1} has an if: condition`);
    if (/^ {8}continue-on-error:/m.test(step.raw)) problems.push(`step ${i + 1} has continue-on-error`);
  }
  return problems;
};

describe("workflow files", () => {
  it("has exactly the expected workflows and the shared composite actions", () => {
    expect(workflowFiles.sort()).toEqual([".github/workflows/claude.yml", ".github/workflows/docs.yml", ".github/workflows/gate.yml", ".github/workflows/nightly.yml"]);
    expect(actionFiles.sort()).toEqual([".github/actions/gate-report/action.yml", ".github/actions/setup-gate/action.yml"]);
  });

  it.each(allFiles)("%s pins every external action by full commit SHA with a version comment", (file) => {
    const uses = read(file).split(/\r?\n/).filter((line) => /^\s*(?:- )?uses:/.test(line) && !/uses:\s*\.\//.test(line));
    for (const line of uses) expect(line, line).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/);
  });

  it.each(allFiles)("%s uses no floating runner image", (file) => {
    const text = read(file);
    expect(text).not.toMatch(/ubuntu-latest|windows-latest|macos-latest/);
    for (const match of text.matchAll(/^\s*runs-on:\s*(.+?)\s*$/gm)) expect(match[1]).toBe("ubuntu-24.04");
  });

  it("has no self-hosted workflow (the hub's AI implementers run from launchd on the Mac, not from Actions)", () => {
    expect(workflowFiles).not.toContain(".github/workflows/ai-implementers.yml");
  });
});

describe("next.config.ts guards production type-check", () => {
  const nextConfig = stripComments(read("next.config.ts").replace(/^\s*\/\/.*$/gm, "")); // comments cannot satisfy the match

  it("sets ignoreBuildErrors from exactly FLOWLINE_SKIP_BUILD_TYPECHECK=1 AND FLOWLINE_ENV=test", () => {
    expect(nextConfig).toMatch(
      /typescript:\s*\{\s*ignoreBuildErrors:\s*process\.env\.FLOWLINE_SKIP_BUILD_TYPECHECK === "1"\s*&&\s*process\.env\.FLOWLINE_ENV === "test"\s*\}/,
    );
  });

  // Evaluates the real config under each environment: only the test build with the flag may skip the type-check.
  it.each([
    ["1", "test", true],
    ["1", undefined, false],
    ["1", "staging", false],
    ["1", "production", false],
    [undefined, "test", false],
    ["0", "test", false],
    [undefined, undefined, false],
  ])("FLOWLINE_SKIP_BUILD_TYPECHECK=%s with FLOWLINE_ENV=%s skips type-checking: %s", async (skip, env, expected) => {
    vi.resetModules();
    vi.stubEnv("FLOWLINE_SKIP_BUILD_TYPECHECK", skip as string);
    vi.stubEnv("FLOWLINE_ENV", env as string);
    try {
      const { default: config } = await import("../../next.config");
      expect(config.typescript?.ignoreBuildErrors).toBe(expected);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("gate.yml always reports a real `gate`", () => {
  const text = read(".github/workflows/gate.yml");
  const byJob = jobs(text);

  it("has no path filter and no label trigger, so no no-op run can emit `gate`", () => {
    expect(stripComments(text)).not.toMatch(/paths-ignore|^\s+paths:/m);
    expect(stripComments(text)).not.toMatch(/labeled/);
    expect(triggerTypes(text, "pull_request")).toEqual(["opened", "synchronize", "reopened", "ready_for_review"]);
    expect(text).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(text).toMatch(/^ {2}workflow_dispatch:$/m);
  });

  it("does not read the full-gate label", () => {
    expect(stripComments(text)).not.toMatch(/full-gate|labels\./);
  });

  it("defines exactly the expected jobs, with the combiner named `gate`", () => {
    expect(Object.keys(byJob)).toEqual(["changes", "checks", "chromium", "firefox", "webkit", "gate"]);
    expect(text).not.toMatch(/^\s+name:\s*gate\s*$/m);
  });

  it.each(["checks", "chromium", "firefox", "webkit"])("%s needs `changes` and is skipped for docs-only changes", (job) => {
    expect(byJob[job]).toMatch(/^ {4}needs: changes$/m);
    expect(byJob[job]).toMatch(/^ {4}if: .*needs\.changes\.outputs\.code == 'true'/m);
  });

  it("runs the full browsers only for a full-tier dispatch", () => {
    for (const job of ["firefox", "webkit"]) expect(byJob[job]).toMatch(/^ {4}if: .*github\.event_name == 'workflow_dispatch' && inputs\.tier == 'full'/m);
  });

  it("keeps drafts from allocating runners", () => {
    for (const job of ["changes", "checks", "chromium", "gate"]) {
      expect(byJob[job]).toMatch(/^ {4}if: .*github\.event\.pull_request\.draft == false/m);
    }
  });

  it("combines every job result, even after failures, and fails when `changes` did", () => {
    expect(byJob.gate).toMatch(/^ {4}needs: \[changes, checks, chromium, firefox, webkit\]$/m);
    expect(byJob.gate).toMatch(/^ {4}if: \$\{\{ always\(\) && /m);
    expect(byJob.gate).toContain('if [ "$R_CHANGES" != "success" ]; then');
    expect(byJob.gate).toContain("docs-only change: test jobs skipped by design");
  });

  it("gives only the `changes` job read access to pull requests", () => {
    expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(byJob.changes).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n/m);
    expect(text.match(/pull-requests: read/g)).toHaveLength(1);
  });

  it("runs tsc --noEmit on every PR in the static leg, without a condition that skips it or continue-on-error", async () => {
    // Browser jobs skip Next's own type-check only because this leg already type-checks the same commit.
    const run = steps(byJob.checks).find((step) => step.run?.startsWith("pnpm gate --only=static,unit,contract"));
    expect(run, "the static gate step").toBeDefined();
    expect(run!.if).toBe("matrix.kind == 'static'");
    expect(run!.raw).not.toMatch(/continue-on-error:/);
    expect(byJob.checks).toMatch(/^ {10}- \{ part: static·unit·contract, kind: static, report: checks-static \}$/m);
    const { expandSteps } = await import("../../scripts/gate-groups.mjs");
    expect(expandSteps(["static"])).toContain("typecheck");
    expect(read("scripts/gate.mjs")).toContain('typecheck: "pnpm typecheck"');
    expect(JSON.parse(read("package.json")).scripts.typecheck).toBe("tsc --noEmit");
  });

  it("sets FLOWLINE_SKIP_BUILD_TYPECHECK only on browser build jobs, never on the typecheck job", () => {
    // Browser jobs set it
    // next.config.ts honours the skip only with FLOWLINE_ENV=test, so each browser job must carry both.
    for (const job of ["chromium", "firefox", "webkit"]) {
      expect(byJob[job], job).toMatch(/^ {6}FLOWLINE_SKIP_BUILD_TYPECHECK: "1"/m);
      expect(byJob[job], job).toMatch(/^ {6}FLOWLINE_ENV: test\b/m);
    }
    // The checks job (which runs typecheck) must NOT set it
    expect(byJob.checks).not.toContain("FLOWLINE_SKIP_BUILD_TYPECHECK");
    // The changes and gate jobs must NOT set it
    expect(byJob.changes).not.toContain("FLOWLINE_SKIP_BUILD_TYPECHECK");
    expect(byJob.gate).not.toContain("FLOWLINE_SKIP_BUILD_TYPECHECK");
  });
});

describe("nightly.yml stays off the PR path", () => {
  const text = read(".github/workflows/nightly.yml");

  it("runs on a schedule or by dispatch only, never on pull_request or push", () => {
    expect(stripComments(text)).toMatch(/^ {2}schedule:$/m);
    expect(stripComments(text)).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(stripComments(text)).not.toMatch(/^ {2}(pull_request|pull_request_target|push):/m);
  });

  it("runs, in this order and unconditionally: checkout, shared setup, createdb flowline_test, pnpm test:nightly", () => {
    // The container only has `flowline`; the suite migrates flowline_test, so it must exist before the tests run.
    expect(nightlyProblems(text)).toEqual([]);
    expect(steps(jobs(text).nightly).map((step) => step.run ?? step.uses?.replace(/@.*/, ""))).toEqual([
      "actions/checkout",
      "./.github/actions/setup-gate",
      "docker exec flowline-ci-postgres createdb -U flowline flowline_test",
      "pnpm test:nightly",
    ]);
    expect(read(".github/actions/setup-gate/action.yml")).toMatch(/POSTGRES_DB=flowline(?!_)/);
    expect(stripComments(text)).not.toMatch(/run: pnpm test\s*$/m);
  });

  describe("the nightly step guard fails on a broken job (negative controls)", () => {
    const checkout = "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          persist-credentials: false\n";
    const setup = '      - uses: ./.github/actions/setup-gate\n        with:\n          postgres: "true"\n          sandbox-image: "true"\n';
    const createdb = "      - name: Create the nightly database\n        run: docker exec flowline-ci-postgres createdb -U flowline flowline_test\n";
    const test = "      - name: Run the nightly project\n        run: pnpm test:nightly\n";
    // The report job's issue body mentions `pnpm test:nightly`, as the real file's does: it must not satisfy the guard.
    const report = '  report:\n    steps:\n      - run: |\n          gh issue create --body "failed (`pnpm test:nightly`)"\n';
    const workflow = (...parts: string[]) => `name: Nightly\njobs:\n  nightly:\n    runs-on: ubuntu-24.04\n    steps:\n${parts.join("")}${report}`;

    it("accepts the intended job", () => {
      expect(nightlyProblems(workflow(checkout, setup, createdb, test))).toEqual([]);
    });

    it.each([
      ["createdb commented out", workflow(checkout, setup, createdb.replace("        run:", "        # run:"), test)],
      ["createdb only in a step name", workflow(checkout, setup, "      - name: docker exec flowline-ci-postgres createdb -U flowline flowline_test\n        run: echo ok\n", test)],
      ["createdb after pnpm test:nightly", workflow(checkout, setup, test, createdb)],
      ["pnpm test:nightly missing (the report body still names it)", workflow(checkout, setup, createdb)],
      ["pnpm test:nightly commented out", workflow(checkout, setup, createdb, test.replace("        run:", "        # run:"))],
      ["pnpm test:nightly only in a step name", workflow(checkout, setup, createdb, "      - name: pnpm test:nightly\n        run: echo ok\n")],
      ["createdb for another database", workflow(checkout, setup, createdb.replace("flowline_test", "flowline"), test)],
      ["a step with an if: condition", workflow(checkout, setup, createdb, test.replace("        run:", "        if: always()\n        run:"))],
      ["a step with continue-on-error", workflow(checkout, setup, createdb, test.replace("        run:", "        continue-on-error: true\n        run:"))],
      ["checkout keeping credentials", workflow(checkout.replace("persist-credentials: false", "persist-credentials: true"), setup, createdb, test)],
      ["setup without the sandbox image", workflow(checkout, setup.replace('sandbox-image: "true"', 'sandbox-image: "false"'), createdb, test)],
      ["an extra step", workflow(checkout, setup, createdb, test, "      - run: echo done\n")],
    ])("%s", (_name, broken) => {
      expect(nightlyProblems(broken).length).toBeGreaterThan(0);
    });
  });

  it("reports a red nightly on main as one nightly-red issue, with write access only in that job", () => {
    const report = jobs(text).report;
    expect(report).toMatch(/^ {4}needs: nightly$/m);
    expect(report).toMatch(/^ {4}if: \$\{\{ failure\(\) && github\.ref == 'refs\/heads\/main' \}\}$/m);
    expect(report).toMatch(/^ {4}permissions:\n {6}issues: write\n/m);
    expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(text.match(/issues: write/g)).toHaveLength(1);
  });

  it("report job: one step, GH_TOKEN only from github.token in env, never printed, no continue-on-error, ≤ 5 minutes", () => {
    const report = jobs(text).report;
    expect(report).toMatch(/^ {4}timeout-minutes: [1-5]$/m);
    expect(report).not.toMatch(/continue-on-error:/);
    const [step, ...rest] = steps(report);
    expect(rest).toEqual([]);
    expect(step.if).toBeUndefined();
    expect(step.raw).toMatch(/^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
    // The command block never mentions the token (no echo, print or xtrace of it), nor any other secret.
    expect(step.run).not.toMatch(/GH_TOKEN|github\.token|secrets\.|set -x|xtrace/);
    expect(step.run).toContain("set -euo pipefail");
    // The list call has no error suppression, so an API failure fails the job instead of reading as "no open issue".
    expect(step.run).toMatch(/^open=\$\(gh issue list --state open --label nightly-red --json number --jq '[^']+'\)$/m);
    expect(step.run).toContain("gh label create nightly-red");
    expect(step.run).toContain('gh issue comment "$open"');
    expect(step.run).toContain("gh issue create --label nightly-red");
    expect(step.run).toContain("|| gh issue create --title");
  });

  it("nightly job has timeout-minutes ≤ 30 and neither job uses continue-on-error", () => {
    const nightlyJob = jobs(text).nightly;
    expect(nightlyJob).toMatch(/^ {4}timeout-minutes: (?:[1-9]|[12][0-9]|30)$/m);
    expect(nightlyJob).not.toMatch(/continue-on-error:\s*true/);
    const reportJob = jobs(text).report;
    expect(reportJob).not.toMatch(/continue-on-error:\s*true/);
  });
});

describe("the nightly vitest project", () => {
  it("is a named project that pnpm test:nightly selects, and the PR projects exclude exactly its files", async () => {
    // A computed specifier: tsc rejects a literal ".mts" import path without allowImportingTsExtensions.
    const { default: config } = (await import(new URL("../../vitest.config.mts", import.meta.url).href)) as { default: { test?: { projects?: unknown[] } } };
    const projects = (config.test?.projects ?? []) as { test: { name: string; include: string[]; exclude?: string[] } }[];
    const byName = Object.fromEntries(projects.map((p) => [p.test.name, p.test]));
    const files = byName.nightly.include;
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(() => read(file), file).not.toThrow();
    expect(byName.unit.exclude).toEqual(files);
    expect(byName.integration.exclude).toEqual(files);
    expect(JSON.parse(read("package.json")).scripts["test:nightly"]).toMatch(/vitest run --project nightly$/);
  });

  it("includes every test file that was moved to nightly (no moved file silently dropped)", async () => {
    const { default: config } = (await import(new URL("../../vitest.config.mts", import.meta.url).href)) as { default: { test?: { projects?: unknown[] } } };
    const projects = (config.test?.projects ?? []) as { test: { name: string; include: string[]; exclude?: string[] } }[];
    const byName = Object.fromEntries(projects.map((p) => [p.test.name, p.test]));
    const nightlyFiles = byName.nightly.include;
    // These are the files that the slim-down plan explicitly moves to nightly
    const expectedNightlyFiles = [
      "tests/integration/p2-code-sandbox.test.ts",
      "tests/integration/company-builder-cli.test.ts",
      "tests/unit/drizzle-tooling-prune.test.ts",
    ];
    for (const expected of expectedNightlyFiles) {
      expect(nightlyFiles).toContain(expected);
    }
    // Ensure sec-* tests are NOT in nightly (they stay in per-PR integration)
    const secTests = ["tests/integration/sec-upgrade.test.ts", "tests/integration/sec-cxh06-rotation.test.ts", "tests/integration/sec-cxh01-backfill.test.ts"];
    for (const sec of secTests) {
      expect(nightlyFiles).not.toContain(sec);
      expect(byName.integration.exclude).not.toContain(sec);
    }
  });
});

describe("gate.yml keeps every fast-tier job under 5 minutes", () => {
  const byJob = jobs(read(".github/workflows/gate.yml"));

  it.each(["changes", "checks", "chromium", "gate"])("%s has timeout-minutes: 5", (job) => {
    expect(byJob[job]).toMatch(/^ {4}timeout-minutes: 5$/m);
  });
});

describe("gate.yml reports every `checks` leg on its own", () => {
  const checks = jobs(read(".github/workflows/gate.yml")).checks;
  // Matrix entries look like `- { part: integration 1/3, kind: integration, shard: 1/3, report: checks-integration-1of3 }`.
  const legs = [...checks.matchAll(/^ {10}- \{ (.+) \}$/gm)].map((match) =>
    Object.fromEntries(match[1].split(", ").map((pair) => [pair.slice(0, pair.indexOf(": ")), pair.slice(pair.indexOf(": ") + 2)])),
  );
  // The steps of the job: a step starts with `      - ` (six spaces); matrix entries are indented deeper.
  const steps = checks.split(/^ {6}- /m).slice(1);
  const reportSteps = steps.filter((step) => step.includes("uses: ./.github/actions/gate-report"));
  const reportFor = (kind: string) => reportSteps.filter((step) => step.includes(`if: always() && matrix.kind == '${kind}'`));

  it("gives every leg a unique report name that is safe in an artifact name", () => {
    expect(legs).toHaveLength(4);
    const reports = legs.map((leg) => leg.report);
    expect(new Set(reports).size).toBe(reports.length);
    for (const report of reports) expect(report).toMatch(/^checks-[a-z0-9-]+$/);
  });

  it("runs one static leg and the integration shards 1..N of one total, each report named after its shard", () => {
    expect(legs.filter((leg) => leg.kind === "static")).toEqual([{ part: "static·unit·contract", kind: "static", report: "checks-static" }]);
    const shards = legs.filter((leg) => leg.kind === "integration");
    const total = Number(shards[0].shard.split("/")[1]);
    expect(shards.map((leg) => leg.shard)).toEqual(Array.from({ length: total }, (_, i) => `${i + 1}/${total}`));
    for (const leg of shards) expect(leg.report).toBe(`checks-integration-${leg.shard.replace("/", "of")}`);
  });

  it("gives every leg its own output directory, so one leg's summary is never another's", () => {
    expect(checks).toContain("GATE_OUT: artifacts/gates/ci-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.report }}");
  });

  it("has one Report step for the static leg and one for the integration shards, each only for its own leg", () => {
    expect(reportSteps).toHaveLength(2);
    const [staticReport] = reportFor("static");
    const [shardReport] = reportFor("integration");
    expect(reportFor("static")).toHaveLength(1);
    expect(reportFor("integration")).toHaveLength(1);
    for (const step of [staticReport, shardReport]) {
      expect(step).toContain("job: ${{ matrix.report }}");
      expect(step).toContain("out: ${{ env.GATE_OUT }}");
    }
    // The shard report states which shard it expects; the static one expects none.
    expect(shardReport).toContain("shard: ${{ matrix.shard }}");
    expect(staticReport).not.toMatch(/shard:/);
  });

  it("runs the static gate on the static leg only", () => {
    const run = steps.find((step) => step.includes("name: Run gate (static, unit, contract)"))!;
    expect(run).toMatch(/^ {8}if: matrix\.kind == 'static'$/m);
    expect(run).toContain('run: pnpm gate --only=static,unit,contract --out="$GATE_OUT"');
  });

  it("runs every shard through the shard script, which writes that shard's own summary, never bare vitest", () => {
    const run = steps.find((step) => step.includes("name: Run integration shard"))!;
    expect(run).toMatch(/^ {8}if: matrix\.kind == 'integration'$/m);
    expect(run).toContain('run: node scripts/ci/integration-shard.mjs --shard=${{ matrix.shard }} --tier="$GATE_TIER" --out="$GATE_OUT"');
    expect(checks).not.toMatch(/vitest\.mjs run/);
  });
});

describe("gate-report reads only its own leg's summary", () => {
  const action = read(".github/actions/gate-report/action.yml");
  // The inline Node script of the first step, dedented as bash receives it from the heredoc.
  const script = /<<'NODE'\n([\s\S]*?)\n {8}NODE\n/.exec(action)![1].replace(/^ {8}/gm, "");
  const staticSummary = { sha: "abc1234", ok: true, browsersMode: "sequential", steps: [{ name: "lint", status: "pass", durationMs: 1000, totals: null, note: undefined }] };
  const shardSummary = (shard: string, over: object = {}) => ({ sha: "abc1234", ok: true, shard, steps: [{ name: `integration ${shard}`, status: "pass", durationMs: 2000, totals: { passed: 9 } }], ...over });

  // Runs the script as the action does: the summary path, job and expected shard come from the environment.
  const render = (summary: object, expectedShard: string) => {
    const dir = mkdtempSync(join(tmpdir(), "flowline-report-"));
    try {
      writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
      const result = spawnSync(process.execPath, ["--input-type=module"], {
        input: script, encoding: "utf8", cwd: dir,
        env: { ...process.env, GATE_SUMMARY: join(dir, "summary.json"), GATE_JOB: "checks-test", GATE_TIER: "fast", GATE_SHARD: expectedShard },
      });
      return { status: result.status, out: result.stdout, err: result.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("uploads under an artifact name that carries the leg, the run and the attempt", () => {
    expect(action).toContain("name: flowline-gate-${{ inputs.job }}-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(action).toMatch(/^ {2}shard:\n(?: {4}.*\n)*? {4}default: ""$/m);
    expect(action).toContain("GATE_SHARD: ${{ inputs.shard }}");
  });

  it("renders the static leg's report when no shard is expected", () => {
    const { status, out } = render(staticSummary, "");
    expect(status).toBe(0);
    expect(out).toContain("result: **PASS** · browser mode: sequential");
    expect(out).not.toContain("integration shard");
  });

  it("renders a shard's report only for that shard", () => {
    const { status, out } = render(shardSummary("1/3"), "1/3");
    expect(status).toBe(0);
    expect(out).toContain("result: **PASS** · integration shard 1/3");
    expect(out).toContain("| integration 1/3 | pass | 2.0s | 9 passed |");
    expect(out).not.toContain("browser mode");
  });

  it.each([
    ["a shard report read by the static leg", shardSummary("1/3"), ""],
    ["the static report read by a shard leg", staticSummary, "2/3"],
    ["another shard's report", shardSummary("1/3"), "2/3"],
  ])("rejects %s instead of rendering it as that leg's result", (_name, summary, expected) => {
    const { status, out, err } = render(summary, expected);
    expect(status).toBe(1);
    expect(out).toContain("Not this leg's report");
    expect(out).toContain("No result is claimed for this leg");
    expect(out).not.toMatch(/result: \*\*(PASS|FAIL)\*\*/);
    expect(err).toContain("::error title=Gate report mismatch::checks-test read a summary that is not its own");
  });

  it("shows an unfinished shard as FAIL with the reason, so a killed shard never reads as a pass", () => {
    const unfinished = shardSummary("3/3", { ok: false, steps: [{ name: "integration 3/3", status: "incomplete", durationMs: 0, totals: null, note: "started, no result yet" }] });
    const { status, out } = render(unfinished, "3/3");
    expect(status).toBe(0);
    expect(out).toContain("result: **FAIL** · integration shard 3/3");
    expect(out).toContain("| integration 3/3 | incomplete | — | started, no result yet |");
  });

  it("says plainly that no result exists when the leg wrote no summary", () => {
    expect(action).toContain('echo "Gate summary was not created for $GATE_JOB. Check the job logs for setup or early gate failures. No result is claimed for this leg."');
  });
});

describe("docs.yml always re-evaluates", () => {
  const text = read(".github/workflows/docs.yml");

  it("reruns on label and body edits", () => {
    expect(triggerTypes(text, "pull_request")).toEqual(["opened", "synchronize", "reopened", "ready_for_review", "labeled", "unlabeled", "edited"]);
  });

  it("checks out only the checker script, not the whole repository", () => {
    expect(text).toMatch(/^ {10}sparse-checkout: scripts\/ci$/m);
  });

  it("skips only drafts, never on a label, an edit or a path", () => {
    expect(stripComments(text)).not.toMatch(/paths-ignore|^\s+paths:/m);
    expect(jobs(text).docs).toMatch(/^ {4}if: \$\{\{ !github\.event\.pull_request\.draft \}\}$/m);
  });
});

describe("gate-report keeps a browser failure diagnosable (issue #35)", () => {
  const action = read(".github/actions/gate-report/action.yml");
  // Splits the composite action into { step name: body text } using the fixed four-space step indentation.
  const steps: Record<string, string> = {};
  const parts = action.slice(action.indexOf("\n  steps:\n")).split(/^ {4}- name: (.+)$/m);
  for (let i = 1; i < parts.length; i += 2) steps[parts[i]] = parts[i + 1];
  const logs = stripComments(steps["Upload gate logs and reports"] ?? "");
  const traces = stripComments(steps["Upload Playwright traces"] ?? "");
  const retention = (body: string) => Number(/^ {8}retention-days: (\d+)$/m.exec(body)?.[1]);
  const uploadPin = (body: string) => /uses: (actions\/upload-artifact@[0-9a-f]{40}) # v\d+\.\d+\.\d+$/m.exec(body)?.[1];

  it("uploads the per-shard Playwright JSON report and error context with the gate logs", () => {
    expect(logs).toMatch(/^ {6}if: \$\{\{ always\(\) \}\}$/m);
    for (const glob of ["artifacts/gates/**", "test-results/*-report.txt", "test-results/*-results.json", "test-results/**/error-context.md", "test-results/**/test-failed-*.png"]) {
      expect(logs.split("\n").map((line) => line.trim()), glob).toContain(glob);
    }
    expect(logs).not.toContain("trace.zip");
    expect(retention(logs)).toBe(14);
  });

  it("uploads trace.zip files as their own short-lived artifact, only creating it when a trace exists", () => {
    expect(traces).toMatch(/^ {6}if: \$\{\{ always\(\) \}\}$/m);
    expect(traces).toMatch(/^ {8}name: flowline-gate-\$\{\{ inputs\.job \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-traces$/m);
    expect(traces).toMatch(/^ {8}path: test-results\/\*\*\/trace\.zip$/m);
    expect(traces).toMatch(/^ {8}if-no-files-found: ignore$/m);
    expect(retention(traces)).toBe(7);
  });

  it("reuses the existing upload-artifact pin for both uploads", () => {
    expect(uploadPin(logs)).toBeDefined();
    expect(uploadPin(traces)).toBe(uploadPin(logs));
  });

  it("matches what the browser runners write and what Playwright records", () => {
    // test-results/<project>-<shard>-results.json (JSON) and <output dir>/<test folder>/trace.zip (trace).
    expect(read("scripts/gate-browser-native.mjs")).toContain("`test-results/${project}-${stack.k}-results.json`");
    expect(read("scripts/gate-browser-native.mjs")).toContain("`--output=test-results/${project}-${stack.k}`");
    expect(read("e2e/tools/browser-docker.sh")).toContain('"test-results/$out-results.json"');
    const config = stripComments(read("playwright.config.ts"));
    expect(config).toMatch(/\btrace: "retain-on-failure"/);
    expect(config).toMatch(/\bretries: 0\b/);
  });

  it("keeps secrets out of what a public repository's artifacts expose", () => {
    // Traces record the page's network log and DOM, so the job must not hold repository secrets, and the specs that
    // reveal write-only credentials must keep tracing off (their canary values must not land in evidence).
    for (const file of gateFiles) expect(stripComments(read(file)), file).not.toMatch(/secrets\./);
    const byJob = jobs(read(".github/workflows/gate.yml"));
    for (const job of ["checks", "chromium", "firefox", "webkit"]) expect(byJob[job], job).not.toMatch(/github\.token|GH_TOKEN/);
    for (const spec of ["e2e/admin-panel.spec.ts", "e2e/keyboard-surfaces.spec.ts"]) {
      expect(read(spec), spec).toMatch(/^test\.use\(\{ trace: "off", screenshot: "off", video: "off" \}\);$/m);
    }
  });
});

describe("ai-implementers.yml (Mac mini hub)", () => {
  // Assert on active lines only: whole-line comments are stripped and every pattern is anchored to a line start, so a
  // commented-out `# cron: ...` / `# group: ...` or a match inside a trailing comment cannot satisfy these checks.
  const text = stripComments(read(".github/workflows/ai-implementers.yml"));
  const byJob = jobs(text);
  // Collect crons from both double-quoted and single-quoted YAML values (GitHub supports both).
  const crons = [...text.matchAll(/^ {4}- cron: (?:"([^"]+)"|'([^']+)')/gm)].map((match) => match[1] ?? match[2]);

  it("ignores commented-out schedules and runners (guard against the raw-text false positive)", () => {
    const sample = stripComments('on:\n  schedule:\n    # - cron: "0 */2 * * *"\n    - cron: "5 * * * *"\n    # runs-on: [self-hosted, macmini]\n');
    const dualQuote = /^ {4}- cron: (?:"([^"]+)"|'([^']+)')/gm;
    expect([...sample.matchAll(dualQuote)].map((m) => m[1] ?? m[2])).toEqual(["5 * * * *"]);
    expect(sample).not.toMatch(/^ {4}runs-on: \[self-hosted, macmini\]/m);
    // Single-quoted crons are counted too (GitHub supports both styles).
    const singleQuoted = stripComments("on:\n  schedule:\n    - cron: '10 * * * *'\n");
    expect([...singleQuoted.matchAll(dualQuote)].map((m) => m[1] ?? m[2])).toEqual(["10 * * * *"]);
  });

  it("defines exactly the start, rescue and automerge schedules", () => {
    expect(crons).toEqual(["0 */2 * * *", "30 */3 * * *", "15 * * * *"]);
  });

  it("schedules start 24/7 every 2 hours and matches the start job trigger", () => {
    expect(crons[0]).toBe("0 */2 * * *");
    expect(byJob.start).toMatch(/^ {4}if: .*github\.event\.schedule == '0 \*\/2 \* \* \*'/m);
  });

  it("routes the rescue and automerge schedules to their own jobs", () => {
    expect(byJob.rescue).toMatch(/^ {4}if: .*github\.event\.schedule == '30 \*\/3 \* \* \*'/m);
    expect(byJob.automerge).toMatch(/^ {4}if: .*github\.event\.schedule == '15 \* \* \* \*'/m);
  });

  it("runs all jobs on self-hosted macmini runner with dedicated concurrency", () => {
    for (const job of ["start", "rescue", "automerge", "mention"]) {
      expect(byJob[job]).toMatch(/^ {4}runs-on: \[self-hosted, macmini\]\s*$/m);
    }
    for (const job of ["start", "rescue", "automerge"]) {
      expect(byJob[job]).toMatch(/^ {6}group: ai-/m);
    }
  });
});
