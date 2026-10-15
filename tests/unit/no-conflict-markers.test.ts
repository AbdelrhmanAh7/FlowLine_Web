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
