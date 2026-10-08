import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Text-level guards for .github/ (no YAML parser is a project dependency). They pin the invariants behind the required
// `gate` and `docs` checks on main; behaviour that depends on GitHub itself can only be verified by a live run.
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const workflowFiles = readdirSync(join(root, ".github/workflows")).filter((f) => f.endsWith(".yml")).map((f) => `.github/workflows/${f}`);
const actionFiles = readdirSync(join(root, ".github/actions")).map((dir) => `.github/actions/${dir}/action.yml`);
const allFiles = [...workflowFiles, ...actionFiles];

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

describe("workflow files", () => {
  it("finds the workflows and composite actions", () => {
    expect(workflowFiles.sort()).toEqual([".github/workflows/ai-implementers.yml", ".github/workflows/claude.yml", ".github/workflows/docs.yml", ".github/workflows/gate.yml"]);
    expect(actionFiles.sort()).toEqual([".github/actions/gate-report/action.yml", ".github/actions/setup-gate/action.yml"]);
  });

  it.each(allFiles)("%s pins every external action by full commit SHA with a version comment", (file) => {
    const uses = read(file).split(/\r?\n/).filter((line) => /^\s*(?:- )?uses:/.test(line) && !/uses:\s*\.\//.test(line));
    for (const line of uses) expect(line, line).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/);
  });

  it.each(allFiles)("%s uses no floating runner image", (file) => {
    const text = read(file);
    expect(text).not.toMatch(/ubuntu-latest|windows-latest|macos-latest/);
    // ai-implementers.yml is the one exception: it runs on the owner's Mac mini self-hosted runner.
    const runner = file === ".github/workflows/ai-implementers.yml" ? "[self-hosted, macmini]" : "ubuntu-24.04";
    for (const match of text.matchAll(/^\s*runs-on:\s*(.+?)\s*$/gm)) expect(match[1]).toBe(runner);
  });

  it("keeps the self-hosted AI implementers away from fork and pull-request events", () => {
    const text = stripComments(read(".github/workflows/ai-implementers.yml"));
    expect(text).not.toMatch(/^ {2}pull_request(_target|_review|_review_comment)?:/m);
    expect(jobs(text).mention).toMatch(/author_association == 'OWNER'/);
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

  it("skips only drafts, never on a label, an edit or a path", () => {
    expect(stripComments(text)).not.toMatch(/paths-ignore|^\s+paths:/m);
    expect(jobs(text).docs).toMatch(/^ {4}if: \$\{\{ !github\.event\.pull_request\.draft \}\}$/m);
  });
});
