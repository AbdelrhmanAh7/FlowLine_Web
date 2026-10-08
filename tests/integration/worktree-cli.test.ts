/**
 * Acceptance tests for issue #67: the real `pnpm wt` CLI (scripts/worktree.mjs) against a scratch clone with a local
 * bare `origin`, using real git in a temp directory (no network, no database access, nothing outside the temp dir).
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/worktree.mjs", import.meta.url));
const guide = fileURLToPath(new URL("../../docs/DEVELOPER_GUIDE.md", import.meta.url));
// Hermetic git: no user/system config, fixed identity.
const env = {
  ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "wt", GIT_AUTHOR_EMAIL: "wt@example.test", GIT_COMMITTER_NAME: "wt", GIT_COMMITTER_EMAIL: "wt@example.test",
};
let tmp: string;
let repo: string;
const git = (args: string[], cwd = repo) => {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const wt = (...args: string[]) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: repo, env, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};
const lanePath = (name: string) => join(repo, ".claude", "worktrees", name);

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "flowline-wt-")));
  repo = join(tmp, "repo");
  git(["init", "-q", "--bare", "-b", "main", join(tmp, "origin.git")], tmp);
  git(["init", "-q", "-b", "main", repo], tmp);
  // Same ignore rules as the real repo for the paths the helper touches.
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n.claude/worktrees/\n");
  git(["add", ".gitignore"]);
  git(["commit", "-qm", "init"]);
  git(["remote", "add", "origin", join(tmp, "origin.git")]);
  git(["push", "-q", "-u", "origin", "main"]);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("pnpm wt in a scratch clone", () => {
  it("@e2e @issue-67 AC1: create adds a managed lane on a new branch with node_modules linked", () => {
    const r = wt("add", "lane");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(lanePath("lane"));
    expect(git(["rev-parse", "--abbrev-ref", "HEAD"], lanePath("lane"))).toBe("lane");
    expect(lstatSync(join(lanePath("lane"), "node_modules")).isSymbolicLink()).toBe(true);
  });

  it("@e2e @issue-67 AC1: list shows a fresh lane as clean and pushed", () => {
    expect(wt("add", "lane").code).toBe(0);
    const r = wt("list");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`${lanePath("lane")} | lane | dirty=0 | pushed=true`);
  });

  it("@e2e @issue-67 AC1: remove deletes a clean, pushed lane and keeps its branch", () => {
    expect(wt("add", "lane").code).toBe(0);
    const r = wt("remove", "lane");
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`removed ${lanePath("lane")}`);
    expect(existsSync(lanePath("lane"))).toBe(false);
    expect(git(["branch", "--list", "lane"])).toContain("lane");
    expect(wt("list").stdout).not.toContain(lanePath("lane"));
  });

  it.each(["remove", "rm"])("@e2e @issue-67 AC2: %s refuses a dirty lane with a clear message and keeps the work", (cmd) => {
    expect(wt("add", "lane").code).toBe(0);
    writeFileSync(join(lanePath("lane"), "draft.txt"), "unsaved work\n");
    const r = wt(cmd, "lane");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`refusing to remove ${lanePath("lane")}: 1 uncommitted change(s)`);
    expect(r.stdout).not.toContain("removed");
    expect(readFileSync(join(lanePath("lane"), "draft.txt"), "utf8")).toBe("unsaved work\n");
    expect(wt("list").stdout).toContain(`${lanePath("lane")} | lane | dirty=1 | pushed=true`);
  });

  it("@e2e @issue-67 AC1: create refuses an existing branch and creates no lane", () => {
    git(["branch", "taken"]);
    const r = wt("add", "taken");
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/branch named 'taken' already exists/);
    expect(existsSync(lanePath("taken"))).toBe(false);
  });

  it("@e2e @issue-67 AC1: remove rejects an invalid bare lane name", () => {
    const r = wt("remove", ".hidden");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('invalid lane name ".hidden"');
  });

  it("@e2e @issue-67 AC1: create rejects an invalid lane name before running git", () => {
    const r = wt("add", "feat/x");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('invalid lane name "feat/x"');
    expect(r.stderr).toContain("--branch feat/x");
    expect(existsSync(join(repo, ".claude"))).toBe(false);
    expect(git(["branch", "--list", "feat/x"])).toBe("");
  });

  it("@e2e @issue-67 AC3: the developer guide documents create, list, remove and the dirty refusal message", () => {
    const docs = readFileSync(guide, "utf8");
    for (const example of ["pnpm wt add my-lane", "pnpm wt list", "pnpm wt remove my-lane", "refusing to remove", "uncommitted change(s)"]) {
      expect(docs).toContain(example);
    }
  });
});
