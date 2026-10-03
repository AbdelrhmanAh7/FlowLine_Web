#!/usr/bin/env node
// Worktrees for agent lanes live under .claude/worktrees/<name> (git-ignored; also where Claude Code's own worktree
// isolation puts them), never beside the repo. node_modules is linked to the main checkout's install.
//   pnpm wt add <name> [--base origin/main] [--branch <branch>]   create (branch defaults to <name>)
//   pnpm wt list                                                  state of every worktree
//   pnpm wt rm <name|path>                                        remove a registered, unlocked lane if clean and pushed/merged
//   pnpm wt prune                                                 remove every worktree that is clean and pushed/merged
//                                                                 (not while agents are starting lanes)
// Removal never forces: main, locked, dirty or unpushed work is kept. External lanes require an exact path for rm.
// Prune clears stale registrations first; list/prune skip missing or locked lanes and report per-lane errors.
// The branch itself is never deleted.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function worktrees(root) {
  const out = git(["worktree", "list", "--porcelain"], root);
  return out
    .split(/\r?\n\r?\n/)
    .map((block) => Object.fromEntries(block.split(/\r?\n/).map((l) => [l.split(" ")[0], l.slice(l.indexOf(" ") + 1)])))
    .filter((w) => w.worktree);
}

function state(path) {
  const dirty = git(["status", "--porcelain"], path).split(/\r?\n/).filter(Boolean).length;
  const head = git(["rev-parse", "HEAD"], path);
  const pushed = git(["branch", "-r", "--contains", head], path).length > 0;
  return { dirty, head, pushed };
}

function unlinkModules(path) {
  const nm = join(path, "node_modules");
  // A junction/symlink is removed as a link only, so the shared install is never touched.
  if (existsSync(nm) && lstatSync(nm).isSymbolicLink()) unlinkSync(nm);
}

function remove(w, root) {
  const path = resolve(w.worktree);
  if (path === root) throw new Error(`refusing to remove main checkout: ${path}`);
  if (Object.hasOwn(w, "locked")) throw new Error(`refusing to remove locked worktree: ${path}`);
  const s = state(path);
  if (s.dirty || !s.pushed) {
    console.log(`kept ${path}: ${s.dirty ? `${s.dirty} uncommitted change(s)` : "HEAD not on any remote branch"}`);
    return false;
  }
  unlinkModules(path);
  git(["worktree", "remove", path], root);
  console.log(`removed ${path}`);
  return true;
}

export function main(argv = process.argv.slice(2)) {
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
  } else if (cmd === "rm" && name) {
    const entries = worktrees(root);
    const lane = resolve(dir, name);
    const rel = relative(dir, lane);
    const inside = rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
    const w = entries.find((w) => resolve(w.worktree) === resolve(name))
      ?? entries.find((w) => inside && resolve(w.worktree) === lane);
    if (!w) throw new Error(`not a registered worktree: ${name}`);
    if (remove(w, root)) git(["worktree", "prune"], root);
  } else if (cmd === "list" || cmd === "prune") {
    if (cmd === "prune") git(["worktree", "prune"], root);
    let failed = false;
    for (const w of worktrees(root)) {
      if (resolve(w.worktree) === root) continue;
      try {
        if (Object.hasOwn(w, "locked") || !existsSync(w.worktree)) {
          console.log(`kept ${w.worktree}: ${Object.hasOwn(w, "locked") ? "locked" : "missing directory (possibly prunable)"}`);
          continue;
        }
        if (cmd === "prune") remove(w, root);
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
    console.error("usage: pnpm wt add <name> [--base <ref>] [--branch <branch>] | list | rm <name|path> | prune");
    return 2;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
