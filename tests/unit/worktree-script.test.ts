import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { main, samePath } from "../../scripts/worktree.mjs";

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
