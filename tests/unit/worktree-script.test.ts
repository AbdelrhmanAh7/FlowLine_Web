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
const entry = (path: string, flags = "") => [
  `worktree ${path}`, "HEAD abc", "branch refs/heads/lane", flags,
].filter(Boolean).join("\n") + "\n\n";
const calls = () => mocks.git.mock.calls.map(([, args, options]) => ({ args, cwd: options.cwd }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  entries = entry(root) + entry(lane);
  dirty = "";
  pushed = "origin/lane";
  mocks.exists.mockImplementation((path) => path !== stale);
  mocks.stat.mockReturnValue({ isSymbolicLink: () => true });
  mocks.git.mockImplementation((command, args, { cwd }) => {
    expect(command).toBe("git");
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

describe("worktree add", () => {
  it.each(["lane", "lane-2", "feature.x_1", "A1", "x"])("accepts the bare name %s and branches from it", (name) => {
    const path = join(root, ".claude", "worktrees", name);
    expect(main(["add", name])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args, cwd }) => ({ args, cwd }))).toEqual([
      { args: ["worktree", "add", "-b", name, path, "origin/main"], cwd: root },
    ]);
    expect(mocks.symlink).toHaveBeenCalledWith(join(root, "node_modules"), join(path, "node_modules"), "junction");
    expect(console.log).toHaveBeenCalledWith(path);
  });

  it.each([
    "feat/x", "feat/x/y", "../../sibling", "../sibling", "..", ".", "./lane", "/abs/lane",
    "a b", "-lane", ".hidden", "_lane", "", " ", " lane", "lane\n",
  ])("rejects %j before any git or filesystem access", (name) => {
    expect(() => main(["add", name])).toThrow(/invalid lane name/);
    expect(mocks.git).not.toHaveBeenCalled();
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.symlink).not.toHaveBeenCalled();
  });

  it("explains how to get a slashed branch and which characters are allowed", () => {
    expect(() => main(["add", "feat/x"])).toThrow(/letters, digits.*--branch feat\/x/);
    expect(() => assertLaneName("../../sibling")).toThrow('invalid lane name "../../sibling"');
  });

  it("keeps slashed branch names available through --branch, with --base for the start point", () => {
    const path = join(root, ".claude", "worktrees", "lane2");
    expect(main(["add", "lane2", "--branch", "feat/x", "--base", "origin/dev"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args }) => args))
      .toEqual([["worktree", "add", "-b", "feat/x", path, "origin/dev"]]);
    expect(mocks.symlink).toHaveBeenCalledWith(join(root, "node_modules"), join(path, "node_modules"), "junction");
  });

  it("propagates the git error when the branch already exists and creates no lane", () => {
    const base = mocks.git.getMockImplementation()!;
    mocks.git.mockImplementation((command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") throw new Error("fatal: a branch named 'taken' already exists");
      return base(command, args, options);
    });
    expect(() => main(["add", "lane", "--branch", "taken"])).toThrow(/branch named 'taken' already exists/);
    expect(mocks.symlink).not.toHaveBeenCalled();
  });

  it("without a name prints usage and does nothing", () => {
    expect(main(["add"])).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("usage: pnpm wt add <name>"));
    expect(calls().some(({ args }) => args[1] === "add")).toBe(false);
  });
});

describe("worktree remove", () => {
  it("checks clean and pushed before unlinking, then removes without force and prunes", () => {
    expect(main(["rm", "lane"])).toBe(0);
    expect(mocks.unlink).toHaveBeenCalledWith(join(lane, "node_modules"));
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args, cwd }) => ({ args, cwd })))
      .toEqual([{ args: ["worktree", "remove", lane], cwd: root }]);
    expect(calls().some(({ args }) => args.join(" ") === "worktree prune")).toBe(true);
  });

  it.each(["rm", "remove"])("@issue-67 %s refuses dirty work with a clear message, without unlinking or removing", (cmd) => {
    dirty = " M file1.ts\n M file2.ts";
    expect(() => main([cmd, "lane"])).toThrow(`refusing to remove ${lane}: 2 uncommitted change(s); commit or discard them first`);
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(calls().some(({ args }) => args[1] === "remove")).toBe(false);
  });

  it.each(["rm", "remove"])("%s refuses unpushed work with a clear message", (cmd) => {
    pushed = "";
    expect(() => main([cmd, "lane"])).toThrow(`refusing to remove ${lane}: HEAD not on any remote branch; push it first`);
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(calls().some(({ args }) => args[1] === "remove")).toBe(false);
  });

  it("a bare name selects the managed lane despite a colliding external registration", () => {
    entries = entry(root) + entry(resolve("lane")) + entry(lane);
    expect(main(["rm", "lane"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args }) => args)).toEqual([["worktree", "remove", lane]]);
  });

  it("accepts an external lane only by explicit path", () => {
    entries = entry(root) + entry(external);
    expect(() => main(["rm", "external"])).toThrow(/not a registered worktree/);
    expect(main(["rm", external])).toBe(0);
    expect(mocks.unlink).toHaveBeenCalledWith(join(external, "node_modules"));
  });

  it("refuses the main checkout and locked entries without touching them", () => {
    expect(() => main(["rm", root])).toThrow(/main checkout/);
    entries = entry(root) + entry(lane, "locked");
    expect(() => main(["rm", "lane"])).toThrow(/locked worktree/);
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
});

describe("worktree list and prune", () => {
  it("shows each lane's branch, dirty and pushed state, including detached lanes", () => {
    entries = entry(root) + entry(lane).replace("branch refs/heads/lane\n", "");
    expect(main(["list"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(`${lane} | detached | dirty=0 | pushed=true`);
  });

  it("skips missing or locked entries without inspecting them", () => {
    entries = entry(root) + entry(stale, "prunable") + entry(locked, "locked") + entry(lane);
    expect(main(["list"])).toBe(0);
    expect(calls().some(({ cwd }) => cwd === stale || cwd === locked)).toBe(false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`${stale}: missing directory`));
    expect(console.log).toHaveBeenCalledWith(`${lane} | lane | dirty=0 | pushed=true`);
  });

  it("reports a per-entry error, continues to later lanes, and exits nonzero", () => {
    entries = entry(root) + entry(broken) + entry(lane);
    expect(main(["list"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(`failed ${broken}: cannot inspect lane`);
    expect(console.log).toHaveBeenCalledWith(`${lane} | lane | dirty=0 | pushed=true`);
  });

  it("prunes stale registrations first, then removes only clean, pushed lanes", () => {
    entries = entry(root) + entry(stale, "prunable") + entry(locked, "locked") + entry(lane);
    expect(main(["prune"])).toBe(0);
    expect(mocks.git.mock.calls.map(([, args]) => args.join(" ")).slice(0, 3)).toEqual([
      "rev-parse --path-format=absolute --git-common-dir", "worktree prune", "worktree list --porcelain",
    ]);
    expect(calls().some(({ cwd }) => cwd === stale || cwd === locked)).toBe(false);
    expect(calls().filter(({ args }) => args[1] === "remove").map(({ args }) => args)).toEqual([["worktree", "remove", lane]]);
  });

  it("prune keeps dirty or unpushed lanes with a clear message", () => {
    dirty = " M file.ts";
    expect(main(["prune"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("kept"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 uncommitted change(s)"));
    expect(calls().some(({ args }) => args[1] === "remove")).toBe(false);
  });
});

describe("path identity", () => {
  it("resolves relative segments and normalizes separators", () => {
    expect(samePath(`${lane}/../lane`, lane.replace(/\\/g, "/"), "linux")).toBe(true);
    expect(samePath(lane.replace(/\//g, "\\"), lane, "win32")).toBe(true);
  });

  it("folds case only on Windows", () => {
    expect(samePath(lane.toUpperCase(), lane, "win32")).toBe(true);
    expect(samePath(lane.toUpperCase(), lane, "linux")).toBe(false);
  });
});

describe("argument parsing", () => {
  it("rejects unknown commands with usage", () => {
    expect(main(["unknown"])).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("usage: pnpm wt"));
  });

  it("ignores unknown flags (current parser behaviour)", () => {
    expect(main(["add", "lane", "--unknown", "value"])).toBe(0);
    expect(calls().filter(({ args }) => args[1] === "add").map(({ args }) => args))
      .toEqual([["worktree", "add", "-b", "lane", lane, "origin/main"]]);
  });
});
