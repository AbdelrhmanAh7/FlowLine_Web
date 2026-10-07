import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { assertLaneName, main, samePath } from "../../scripts/worktree.mjs";

const mocks = vi.hoisted(() => ({
  git: vi.fn(), exists: vi.fn(), stat: vi.fn(), unlink: vi.fn(), symlink: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFileSync: mocks.git }));
vi.mock("node:fs", () => ({
  existsSync: mocks.exists, lstatSync: mocks.stat, unlinkSync: mocks.unlink, symlinkSync: mocks.symlink,
}));

// Entirely virtual paths: no child process or filesystem operation reaches the host.
const root = resolve("virtual-flowline");
const lane = join(root, ".claude", "worktrees", "lane");
const external = resolve("virtual-external");
const stale = join(root, ".claude", "worktrees", "stale");
const locked = join(root, ".claude", "worktrees", "locked");
const broken = join(root, ".claude", "worktrees", "broken");
let entries: string;
let dirty: string;
let pushed: string;
let events: string[];
const entry = (path: string, flags = "") => [
  `worktree ${path}`, "HEAD abc", "branch refs/heads/lane", flags,
].filter(Boolean).join("\n") + "\n\n";
const calls = () => mocks.git.mock.calls.map(([, args, options]) => ({ args, cwd: options.cwd }));
const expectUntouched = () => {
  expect(mocks.exists).not.toHaveBeenCalled();
  expect(mocks.stat).not.toHaveBeenCalled();
  expect(mocks.unlink).not.toHaveBeenCalled();
  expect(mocks.symlink).not.toHaveBeenCalled();
  expect(calls().map(({ args }) => args)).toEqual([
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    ["worktree", "list", "--porcelain"],
  ]);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  entries = entry(root) + entry(lane);
  dirty = "";
  pushed = "origin/lane";
  events = [];
  mocks.exists.mockImplementation((path) => path !== stale);
  mocks.stat.mockReturnValue({ isSymbolicLink: () => true });
  mocks.unlink.mockImplementation((path) => { events.push(`unlink ${path}`); });
  mocks.git.mockImplementation((command, args, { cwd }) => {
    expect(command).toBe("git");
    events.push(args.join(" "));
    if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") return join(root, ".git");
    if (args.join(" ") === "worktree list --porcelain") return entries;
    if (args.join(" ") === "worktree prune") return "";
    if (args[0] === "worktree" && args[1] === "remove") return "";
    if (args[0] === "worktree" && args[1] === "add") return "";
    if (cwd === stale || cwd === locked) throw new Error("must not inspect missing/locked lane");
    if (cwd === broken) throw new Error("cannot inspect lane");
    if (args[0] === "status") return dirty;
    if (args.join(" ") === "rev-parse HEAD") return "abc";
    if (args.join(" ") === "branch -r --contains abc") return pushed;
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("worktree removal safeguards", () => {
  it("a bare name selects the managed lane despite a colliding external registration", () => {
    const collision = resolve("lane");
    entries = entry(root) + entry(collision) + entry(lane);
    expect(main(["rm", "lane"])).toBe(0);
    expect(mocks.unlink.mock.calls).toEqual([[join(lane, "node_modules")]]);
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args }) => args))
      .toEqual([["worktree", "remove", lane]]);
    expect(main(["rm", "./lane"])).toBe(0);
    expect(mocks.unlink).toHaveBeenLastCalledWith(join(collision, "node_modules"));
  });

  it("does not fall back to a colliding external registration when the managed lane is absent", () => {
    entries = entry(root) + entry(resolve("lane"));
    expect(() => main(["rm", "lane"])).toThrow(/not a registered worktree/);
    expectUntouched();
  });

  it("matches a mixed-case lane name on Windows", () => {
    expect(main(["rm", "LaNe"], "win32")).toBe(0);
    expect(mocks.unlink).toHaveBeenCalledWith(join(lane, "node_modules"));
  });

  it("matches a mixed-case explicit external path on Windows", () => {
    entries = entry(root) + entry(external);
    expect(main(["rm", external.toUpperCase()], "win32")).toBe(0);
    expect(mocks.unlink).toHaveBeenCalledWith(join(external, "node_modules"));
  });

  it("rejects a mixed-case main registration before inspecting or unlinking it on Windows", () => {
    entries = entry(root.toUpperCase()) + entry(lane);
    expect(() => main(["rm", root], "win32")).toThrow(/main checkout/);
    expectUntouched();
  });

  it("rejects an existing but unregistered path without touching its junction", () => {
    expect(() => main(["rm", external])).toThrow(/not a registered worktree/);
    expectUntouched();
  });

  it.each(["locked", "locked owner is using this lane"])("rejects a %s entry without touching it", (flag) => {
    entries = entry(root) + entry(lane, flag);
    expect(() => main(["rm", "lane"])).toThrow(/locked worktree/);
    expectUntouched();
  });

  it("rejects the main checkout without touching it", () => {
    expect(() => main(["rm", root])).toThrow(/main checkout/);
    expectUntouched();
  });

  it("rejects an outside lane by name but accepts its registered exact path", () => {
    entries = entry(root) + entry(join(root, "outside"));
    expect(() => main(["rm", "outside"])).toThrow(/not a registered worktree/);
    expectUntouched();
    expect(main(["rm", join(root, "outside")])).toBe(0);
    expect(mocks.unlink).toHaveBeenCalledWith(join(root, "outside", "node_modules"));
  });

  it("does not let lane-relative traversal select an outside registration", () => {
    entries = entry(root) + entry(join(root, "outside"));
    expect(() => main(["rm", "../../outside"])).toThrow(/not a registered worktree/);
    expectUntouched();
  });

  it.each(["dirty", "unpushed"])("keeps %s work without unlinking or pruning", (state) => {
    if (state === "dirty") dirty = " M file.ts";
    else pushed = "";
    expect(main(["rm", "lane"])).toBe(0);
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(calls().filter(({ args }) => args[0] === "worktree").map(({ args }) => args))
      .toEqual([["worktree", "list", "--porcelain"]]);
  });

  it("prints a clear message when refusing to remove a dirty worktree", () => {
    dirty = " M file1.ts\n M file2.ts";
    expect(main(["rm", "lane"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("kept"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("2 uncommitted change(s)"));
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("prints a clear message when refusing to remove an unpushed worktree", () => {
    pushed = "";
    expect(main(["rm", "lane"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("kept"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("HEAD not on any remote branch"));
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("checks clean and pushed before unlinking, then removes without force", () => {
    expect(main(["rm", "lane"])).toBe(0);
    expect(events).toEqual([
      "rev-parse --path-format=absolute --git-common-dir", "worktree list --porcelain",
      "status --porcelain", "rev-parse HEAD", "branch -r --contains abc",
      `unlink ${join(lane, "node_modules")}`, `worktree remove ${lane}`, "worktree prune",
    ]);
    expect(calls().find(({ args }) => args[1] === "remove")?.cwd).toBe(root);
  });
});

describe("worktree add lane names", () => {
  const managed = (name: string) => join(root, ".claude", "worktrees", name);
  const BS = String.fromCharCode(92);

  it.each(["lane", "lane-2", "feature.x_1", "A1", "9lives", "a..b", "x"])("accepts the bare name %s and branches from it", (name) => {
    expect(main(["add", name])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args, cwd }) => ({ args, cwd }))).toEqual([
      { args: ["worktree", "add", "-b", name, managed(name), "origin/main"], cwd: root },
    ]);
    expect(mocks.symlink).toHaveBeenCalledWith(join(root, "node_modules"), join(managed(name), "node_modules"), "junction");
    expect(console.log).toHaveBeenCalledWith(managed(name));
  });

  it.each([
    "feat/x", "feat/x/y", "../../sibling", "../sibling", "..", ".", "./lane", "lane/", "/abs/lane",
    `a${BS}b`, `..${BS}..${BS}sibling`, `C:${BS}lane`, "C:lane", "lane:stream",
    "", " ", " lane", "lane ", "a b", "lane\n", "lane\nx", "lane\r", "lane\0", "-lane", "--branch", ".hidden", "_lane", "~lane", "lane*", "lane?", "naïve", "العربية",
  ])("rejects %j before any git or filesystem access", (name) => {
    expect(() => main(["add", name])).toThrow(/invalid lane name/);
    expect(mocks.git).not.toHaveBeenCalled();
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.symlink).not.toHaveBeenCalled();
  });

  it("rejects a bad name even when --branch and --base are given", () => {
    expect(() => main(["add", "feat/x", "--branch", "feat/x", "--base", "origin/main"])).toThrow(/invalid lane name/);
    expect(mocks.git).not.toHaveBeenCalled();
  });

  it("explains how to get a slashed branch and which characters are allowed", () => {
    expect(() => main(["add", "feat/x"])).toThrow(/letters, digits.*--branch feat\/x/);
    expect(() => assertLaneName("../../sibling")).toThrow('invalid lane name "../../sibling"');
  });

  it("keeps slashed branch names available through --branch while the lane stays bare", () => {
    expect(main(["add", "lane2", "--branch", "feat/x", "--base", "origin/dev"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args }) => args))
      .toEqual([["worktree", "add", "-b", "feat/x", managed("lane2"), "origin/dev"]]);
    expect(mocks.symlink).toHaveBeenCalledWith(join(root, "node_modules"), join(managed("lane2"), "node_modules"), "junction");
  });

  it("a created lane can be addressed by the same bare name in rm", () => {
    expect(main(["add", "lane"])).toBe(0);
    expect(main(["rm", "lane"])).toBe(0);
    expect(mocks.unlink).toHaveBeenCalledWith(join(lane, "node_modules"));
  });

  it("without a name prints usage and does nothing", () => {
    expect(main(["add"])).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("usage: pnpm wt add <name>"));
    expect(mocks.symlink).not.toHaveBeenCalled();
    expect(calls().some(({ args }) => args[1] === "add")).toBe(false);
  });

  it("propagates git error when branch already exists on add", () => {
    mocks.git.mockImplementation((_command, args) => {
      if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") return join(root, ".git");
      if (args.join(" ") === "worktree list --porcelain") return entries;
      if (args[0] === "worktree" && args[1] === "add") {
        const err = new Error("fatal: a branch named 'existing-branch' already exists") as Error & { status: number };
        err.status = 128;
        throw err;
      }
      return "";
    });
    expect(() => main(["add", "lane", "--branch", "existing-branch"])).toThrow(/branch named 'existing-branch' already exists/);
    expect(mocks.symlink).not.toHaveBeenCalled();
  });

  it("propagates git error when worktree path already exists on add", () => {
    mocks.git.mockImplementation((_command, args) => {
      if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") return join(root, ".git");
      if (args.join(" ") === "worktree list --porcelain") return entries;
      if (args[0] === "worktree" && args[1] === "add") {
        const err = new Error("fatal: 'path' already exists") as Error & { status: number };
        err.status = 128;
        throw err;
      }
      return "";
    });
    expect(() => main(["add", "lane"])).toThrow(/already exists/);
    expect(mocks.symlink).not.toHaveBeenCalled();
  });
});

describe("worktree iteration", () => {
  it.each(["list", "prune"])("%s skips a mixed-case main registration on Windows", (cmd) => {
    entries = entry(root.toUpperCase()) + entry(lane);
    expect(main([cmd], "win32")).toBe(0);
    expect(calls().some(({ args, cwd }) => args[0] === "status" && cwd === root.toUpperCase())).toBe(false);
    expect(mocks.exists).not.toHaveBeenCalledWith(root.toUpperCase());
    expect(mocks.unlink).not.toHaveBeenCalledWith(join(root.toUpperCase(), "node_modules"));
    expect(calls().some(({ args, cwd }) => args[0] === "status" && cwd === lane)).toBe(true);
  });

  it("prunes registrations first, skips remaining prunable/missing and locked entries, and removes later lanes", () => {
    entries = entry(root) + entry(stale, "prunable gitdir file points to non-existent location")
      + entry(locked, "locked") + entry(lane);
    expect(main(["prune"])).toBe(0);
    expect(events.slice(0, 3)).toEqual([
      "rev-parse --path-format=absolute --git-common-dir", "worktree prune", "worktree list --porcelain",
    ]);
    expect(calls().some(({ cwd }) => cwd === stale || cwd === locked)).toBe(false);
    expect(mocks.unlink.mock.calls).toEqual([[join(lane, "node_modules")]]);
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args }) => args))
      .toEqual([["worktree", "remove", lane]]);
  });

  it.each(["prune", "list"])("%s reports a per-entry error and still processes later lanes", (cmd) => {
    entries = entry(root) + entry(broken) + entry(lane);
    expect(main([cmd])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(`failed ${broken}: cannot inspect lane`);
    expect(calls().some(({ args, cwd }) => cwd === lane && args[0] === "status")).toBe(true);
    if (cmd === "prune") expect(mocks.unlink).toHaveBeenCalledWith(join(lane, "node_modules"));
    else expect(console.log).toHaveBeenCalledWith(`${lane} | lane | dirty=0 | pushed=true`);
  });

  it("lists later lanes without running git in a missing/prunable directory", () => {
    entries = entry(root) + entry(stale, "prunable") + entry(locked, "locked") + entry(lane);
    expect(main(["list"])).toBe(0);
    expect(calls().some(({ cwd }) => cwd === stale || cwd === locked)).toBe(false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`${stale}: missing directory`));
    expect(console.log).toHaveBeenCalledWith(`${lane} | lane | dirty=0 | pushed=true`);
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(calls().filter(({ args }) => args[0] === "worktree").map(({ args }) => args))
      .toEqual([["worktree", "list", "--porcelain"]]);
  });

  it("prune prints a clear message and keeps a dirty worktree", () => {
    dirty = " M file.ts";
    entries = entry(root) + entry(lane);
    expect(main(["prune"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("kept"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 uncommitted change(s)"));
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args }) => args)).toEqual([]);
  });

  it("prune prints a clear message and keeps an unpushed worktree", () => {
    pushed = "";
    entries = entry(root) + entry(lane);
    expect(main(["prune"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("kept"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("HEAD not on any remote branch"));
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args }) => args)).toEqual([]);
  });
});

describe("path identity", () => {
  it("resolves relative segments and normalizes both separators", () => {
    expect(samePath(`${lane}/../lane`, lane.replace(/\\/g, "/"), "linux")).toBe(true);
    expect(samePath(lane.replace(/\//g, "\\"), lane, "win32")).toBe(true);
  });

  it("folds case only on Windows", () => {
    expect(samePath(lane.toUpperCase(), lane, "win32")).toBe(true);
    expect(samePath(lane.toUpperCase(), lane, "linux")).toBe(false);
  });
});

describe("argument parsing and option handling", () => {
  const managed = (name: string) => join(root, ".claude", "worktrees", name);

  it("uses --base option when provided", () => {
    expect(main(["add", "lane", "--base", "origin/develop"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args }) => args))
      .toEqual([["worktree", "add", "-b", "lane", managed("lane"), "origin/develop"]]);
  });

  it("uses --branch option when provided", () => {
    expect(main(["add", "lane", "--branch", "feature/custom"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args }) => args))
      .toEqual([["worktree", "add", "-b", "feature/custom", managed("lane"), "origin/main"]]);
  });

  it("rejects unknown command with usage", () => {
    expect(main(["unknown"])).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("usage: pnpm wt add <name>"));
  });

  it("rejects rm without name with usage", () => {
    expect(main(["rm"])).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("usage: pnpm wt add <name>"));
  });

  it("rejects unknown flag gracefully (treated as positional)", () => {
    // Unknown flags are not parsed specially; they become part of rest
    // This test documents current behavior: --unknown is ignored
    expect(main(["add", "lane", "--unknown", "value"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args }) => args))
      .toEqual([["worktree", "add", "-b", "lane", managed("lane"), "origin/main"]]);
  });

  it("assertLaneName validates exported function directly", () => {
    expect(() => assertLaneName("valid-name")).not.toThrow();
    expect(() => assertLaneName("invalid/name")).toThrow(/invalid lane name/);
    expect(() => assertLaneName("")).toThrow(/invalid lane name/);
  });
});

describe("list command output format", () => {
  it("shows branch name and dirty/pushed status for each lane", () => {
    entries = entry(root) + entry(lane);
    expect(main(["list"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(`${lane} | lane | dirty=0 | pushed=true`);
  });

  it("shows detached HEAD when no branch", () => {
    entries = entry(root) + entry(lane, "").replace("branch refs/heads/lane", "");
    expect(main(["list"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(`${lane} | detached | dirty=0 | pushed=true`);
  });
});
