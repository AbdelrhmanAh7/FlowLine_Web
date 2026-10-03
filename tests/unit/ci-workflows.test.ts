import { readdirSync, readFileSync } from "node:fs";
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
    expect(workflowFiles.sort()).toEqual([".github/workflows/docs.yml", ".github/workflows/gate.yml"]);
    expect(actionFiles.sort()).toEqual([".github/actions/gate-report/action.yml", ".github/actions/setup-gate/action.yml"]);
  });

  it.each(allFiles)("%s pins every external action by full commit SHA with a version comment", (file) => {
    const uses = read(file).split(/\r?\n/).filter((line) => /^\s*(?:- )?uses:/.test(line) && !/uses:\s*\.\//.test(line));
    for (const line of uses) expect(line, line).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/);
  });

  it.each(allFiles)("%s uses no floating runner image", (file) => {
    const text = read(file);
    expect(text).not.toMatch(/ubuntu-latest|windows-latest|macos-latest/);
    for (const match of text.matchAll(/^\s*runs-on:\s*(\S+)/gm)) expect(match[1]).toBe("ubuntu-24.04");
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
