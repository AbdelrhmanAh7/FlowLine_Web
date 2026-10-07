#!/usr/bin/env node
// Worktrees for agent lanes live under .claude/worktrees/<name> (git-ignored; also where Claude Code's own worktree
// isolation puts them), never beside the repo. node_modules is linked to the main checkout's install.
//   pnpm wt add <name> [--base origin/main] [--branch <branch>]   create (branch defaults to <name>)
//                                                                 <name> is a bare lane name: letters, digits, . _ -
//                                                                 (no / or \, so the path stays inside .claude/worktrees/);
//                                                                 use --branch for a branch such as feat/x
//   pnpm wt list                                                  state of every worktree
//   pnpm wt rm|remove <name|path>                                 remove a registered, unlocked lane if clean and pushed/merged;
//                                                                 a dirty or unpushed lane is refused (exit 1)
//   pnpm wt prune                                                 remove every worktree that is clean and pushed/merged
//                                                                 (not while agents are starting lanes)
// Removal never forces: main, locked, dirty or unpushed work is kept. Bare names select managed lanes only.
// External lanes require an explicit path for rm; path comparisons ignore case on Windows.
// Prune clears stale registrations first; list/prune skip missing or locked lanes and report per-lane errors.
// The branch itself is never deleted.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// A lane name becomes one path segment under .claude/worktrees/ and the default branch name. Separators or `..` would
// create a nested lane that `rm <name>` cannot address, or escape the managed directory, so only bare names are allowed.
const LANE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertLaneName(name) {
  if (!LANE_NAME.test(name)) {
    throw new Error(`invalid lane name ${JSON.stringify(name)}: use letters, digits, '.', '_' and '-' only, starting with a letter or digit (no '/' or '\\'). For a branch like feat/x, run: pnpm wt add <lane> --branch feat/x`);
  }
}

export function samePath(a, b, platform = process.platform) {
  const normalize = (path) => {
    const absolute = resolve(path.replace(/\\/g, "/")).replace(/\\/g, "/");
    return platform === "win32" ? absolute.toLowerCase() : absolute;
  };
  return normalize(a) === normalize(b);
}

function worktrees(root) {
  const out = git(["worktree", "list", "--porcelain"], root);
  return out
    .split(/\r?\n\r?\n/)
    .map((block) => Object.fromEntries(block.split(/\r?\n/).map((l) => [l.split(" ")[0], l.slice(l.indexOf(" ") + 1)])))
    .filter((w) => w.worktree);
}

function state(path) {
  // The node_modules link made by `add` is a symlink, which the `node_modules/` ignore rule (directories only) misses.
  const dirty = git(["status", "--porcelain"], path).split(/\r?\n/).filter((l) => l && l !== "?? node_modules").length;
  const head = git(["rev-parse", "HEAD"], path);
  const pushed = git(["branch", "-r", "--contains", head], path).length > 0;
  return { dirty, head, pushed };
}

function unlinkModules(path) {
  const nm = join(path, "node_modules");
  // A junction/symlink is removed as a link only, so the shared install is never touched; lstat also sees a dangling link.
  if (lstatSync(nm, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(nm);
}

// An explicit rm refuses (throws) when work would be kept; prune only reports it and moves on.
function remove(w, root, platform, refuse = false) {
  const path = resolve(w.worktree);
  if (samePath(path, root, platform)) throw new Error(`refusing to remove main checkout: ${path}`);
  if (Object.hasOwn(w, "locked")) throw new Error(`refusing to remove locked worktree: ${path}`);
  const s = state(path);
  if (s.dirty || !s.pushed) {
    const reason = s.dirty ? `${s.dirty} uncommitted change(s); commit or discard them first` : "HEAD not on any remote branch; push it first";
    if (refuse) throw new Error(`refusing to remove ${path}: ${reason}`);
    console.log(`kept ${path}: ${reason}`);
    return false;
  }
  unlinkModules(path);
  git(["worktree", "remove", path], root);
  console.log(`removed ${path}`);
  return true;
}

export function main(argv = process.argv.slice(2), platform = process.platform) {
  // Validate before any git or filesystem access.
  if (argv[0] === "add" && argv[1] !== undefined) assertLaneName(argv[1]);
  const root = resolve(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]), "..");
  const dir = join(root, ".claude", "worktrees");
  const [cmd, name, ...rest] = argv;
  const opt = (flag, fallback) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : fallback;
  };

  if (cmd === "add" && name) {
    const path = join(dir, name);
    git(["worktree", "add", "-b", opt("--branch", name), path, opt("--base", "origin/main")], root);
    symlinkSync(join(root, "node_modules"), join(path, "node_modules"), "junction");
    console.log(path);
  } else if ((cmd === "rm" || cmd === "remove") && name) {
    const entries = worktrees(root);
    const explicitPath = isAbsolute(name) || /[/\\]/.test(name);
    const target = explicitPath ? resolve(name) : resolve(dir, name);
    const w = entries.find((w) => samePath(w.worktree, target, platform));
    if (!w) throw new Error(`not a registered worktree: ${name}`);
    remove(w, root, platform, true);
    git(["worktree", "prune"], root);
  } else if (cmd === "list" || cmd === "prune") {
    if (cmd === "prune") git(["worktree", "prune"], root);
    let failed = false;
    for (const w of worktrees(root)) {
      if (samePath(w.worktree, root, platform)) continue;
      try {
        if (Object.hasOwn(w, "locked") || !existsSync(w.worktree)) {
          console.log(`kept ${w.worktree}: ${Object.hasOwn(w, "locked") ? "locked" : "missing directory (possibly prunable)"}`);
          continue;
        }
        if (cmd === "prune") remove(w, root, platform);
        else {
          const s = state(w.worktree);
          console.log(`${w.worktree} | ${w.branch?.replace("refs/heads/", "") ?? "detached"} | dirty=${s.dirty} | pushed=${s.pushed}`);
        }
      } catch (error) {
        console.error(`failed ${w.worktree}: ${error.message}`);
        failed = true;
      }
    }
    return failed ? 1 : 0;
  } else {
    console.error("usage: pnpm wt add <name> [--base <ref>] [--branch <branch>] | list | rm|remove <name|path> | prune");
    return 2;
  }
  return 0;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
