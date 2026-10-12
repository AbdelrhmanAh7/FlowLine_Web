// Issue #67: real CLI in a scratch clone with a local bare origin; no network, no database.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const script = fileURLToPath(new URL("../../scripts/worktree.mjs", import.meta.url));
const guide = fileURLToPath(new URL("../../docs/DEVELOPER_GUIDE.md", import.meta.url));
// Isolate git from inherited configuration and repository-location variables.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_CONFIG_") || ["GIT_DIR", "GIT_WORK_TREE", "GIT_NAMESPACE"].includes(key)) delete env[key];
}
Object.assign(env, {
  GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "wt", GIT_AUTHOR_EMAIL: "wt@example.test",
  GIT_COMMITTER_NAME: "wt", GIT_COMMITTER_EMAIL: "wt@example.test",
});
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
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n.claude/worktrees/\n");
  git(["add", ".gitignore"]);
  git(["commit", "-qm", "init"]);
  git(["remote", "add", "origin", join(tmp, "origin.git")]);
  git(["push", "-q", "-u", "origin", "main"]);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));
describe("pnpm wt in a scratch clone", () => {
  it.each(["remove", "rm"])("@issue-67 AC2: %s refuses a dirty lane with a clear message and keeps the work", (cmd) => {
    expect(wt("add", "lane").code).toBe(0);
    // Drop the helper's untracked node_modules link so the lane's only change is the one below.
    rmSync(join(lanePath("lane"), "node_modules"));
    writeFileSync(join(lanePath("lane"), "draft.txt"), "unsaved work\n");
    const r = wt(cmd, "lane");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`refusing to remove ${lanePath("lane")}: 1 uncommitted change(s); commit or discard them first`);
    expect(r.stdout).not.toContain("removed");
    expect(readFileSync(join(lanePath("lane"), "draft.txt"), "utf8")).toBe("unsaved work\n");
    expect(wt("list").stdout).toContain(`${lanePath("lane")} | lane | dirty=1 | pushed=true`);
  });
  it("@issue-67 AC3: the developer guide documents the lane-name pattern and the commands", () => {
    const docs = readFileSync(guide, "utf8");
    const pattern = /const LANE_NAME = \/(.+)\/;/.exec(readFileSync(script, "utf8"))?.[1];
    expect(pattern).toBeTruthy();
    expect(docs).toContain(pattern);
    for (const example of ["pnpm wt add my-lane", "pnpm wt list", "pnpm wt remove my-lane", "refusing to remove", "uncommitted change(s)"]) {
      expect(docs).toContain(example);
    }
  });
});
