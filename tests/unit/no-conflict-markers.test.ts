import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Merge-conflict markers shipped in this repository before: a hand-resolved merge against `origin/main` left
// `<<<<<<<` / `=======` / `>>>>>>>` in `DESIGN_DECISIONS.md`, a drizzle migration, the journal and two components
// (PR #139, finding from the #117 review round 8). Nothing in the PR gate caught it: TypeScript still parses the
// file and drizzle-kit does not run on a pull request. This guard fails on any tracked text file that still holds a
// conflict marker, so a broken resolution reaches a test run instead of the reviewer.
const root = fileURLToPath(new URL("../../", import.meta.url));

// Exactly the markers git writes, each seven characters at the start of a line followed by a space: the ours/theirs
// markers (`<<<<<<< HEAD` / `>>>>>>> origin/main`) and diff3's base marker (`||||||| merged common ancestors`).
// A lone `=======` is deliberately not matched: Markdown headings legitimately underline with it.
const MARKER = "^(<{7}|>{7}|\\|{7}) ";

describe("no unresolved merge-conflict markers", () => {
  it("no tracked text file contains a conflict marker", () => {
    // `-I` skips binary files; `git grep` exits 1 when nothing matches, which is the expected (clean) result.
    const result = spawnSync("git", ["grep", "-n", "-I", "-E", MARKER], { cwd: root, encoding: "utf8" });
    expect(result.error, "git must be available to scan the tracked files").toBeUndefined();
    expect(result.status === 0 || result.status === 1, `git grep failed: ${result.stderr}`).toBe(true);
    expect(result.stdout.trim()).toBe("");
  });
});

describe("issue #117 documentation hygiene and contract assertions", () => {
  it("commands in issue #117 verification report contain copy-pasteable shell commands without <placeholder> angle brackets", () => {
    const text = readFileSync(fileURLToPath(new URL("../../artifacts/phase-4/issue-117/VERIFICATION.md", import.meta.url)), "utf8");
    const commands = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!).filter((c) => /^(node|pnpm|vitest|eslint|tsc)\b/.test(c));
    expect(commands.length).toBeGreaterThan(0);
    for (const cmd of commands) {
      expect(cmd, `command "${cmd}" must be copy-pasteable and not contain angle-bracket placeholders`).not.toMatch(/<[a-zA-Z][^>]*>/);
    }
  });

  it("src/server/flows.ts doc comment for listFlows accurately matches the SQL order including startedAt nulls last", () => {
    const flowsSource = readFileSync(fileURLToPath(new URL("../../src/server/flows.ts", import.meta.url)), "utf8");
    expect(flowsSource).toContain("`finishedAt desc nulls last, startedAt desc nulls last, id desc`");
    expect(flowsSource).not.toContain("`finishedAt desc nulls last, startedAt desc, id desc`");
  });

  it("docs accurately describe startedAt nulls last as a deliberate refinement rather than literal spec wording", () => {
    const report = readFileSync(fileURLToPath(new URL("../../docs/implementation/PHASE4_BETA_REPORT.md", import.meta.url)), "utf8");
    const verification = readFileSync(fileURLToPath(new URL("../../artifacts/phase-4/issue-117/VERIFICATION.md", import.meta.url)), "utf8");
    expect(report).toMatch(/deliberate refinement/i);
    expect(report).not.toMatch(/follows the spec's order:\s*`finished_at desc nulls last, started_at desc nulls last/);
    expect(verification).toMatch(/deliberate refinement/i);
  });

  it("PHASE4_BETA_REPORT.md accurately describes the dashboard consequence without inaccurate 'no earlier run' phrasing", () => {
    const report = readFileSync(fileURLToPath(new URL("../../docs/implementation/PHASE4_BETA_REPORT.md", import.meta.url)), "utf8");
    expect(report).not.toMatch(/only while no earlier run of the flow has finished/i);
    expect(report).toMatch(/precedence over an in-flight run|precedence over any in-flight run/i);
  });
});

