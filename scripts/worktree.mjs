#!/usr/bin/env node
// Worktrees for agent lanes live under .claude/worktrees/<name> (git-ignored; also where Claude Code's own worktree
// isolation puts them), never beside the repo. node_modules is linked to the main checkout's install.
//   pnpm wt add <name> [--base origin/main] [--branch <branch>]   create (branch defaults to <name>)
//   pnpm wt list                                                  state of every worktree
//   pnpm wt rm <name>                                             remove one if clean and its HEAD is pushed or merged
//   pnpm wt prune                                                 remove every worktree that is clean and pushed/merged
//                                                                 (not while agents are starting lanes)
// Removal never forces: dirty or unpushed work is reported and kept. The branch itself is never deleted.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const root = resolve(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]), "..");
const dir = join(root, ".claude", "worktrees");

function worktrees() {
  const out = git(["worktree", "list", "--porcelain"], root);
  return out
    .split(/\r?\n\r?\n/)
    .map((block) => Object.fromEntries(block.split(/\r?\n/).map((l) => [l.split(" ")[0], l.slice(l.indexOf(" ") + 1)])))
    .filter((w) => w.worktree && resolve(w.worktree) !== root);
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

function remove(path) {
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

const [cmd, name, ...rest] = process.argv.slice(2);
const opt = (flag, fallback) => {
  const i = rest.indexOf(flag);
  return i >= 0 ? rest[i + 1] : fallback;
};

if (cmd === "add" && name) {
  const path = join(dir, name);
  git(["worktree", "add", "-b", opt("--branch", name), path, opt("--base", "origin/main")], root);
  symlinkSync(join(root, "node_modules"), join(path, "node_modules"), "junction");
  console.log(path);
} else if (cmd === "list") {
  for (const w of worktrees()) {
    const s = state(w.worktree);
    console.log(`${w.worktree} | ${w.branch?.replace("refs/heads/", "") ?? "detached"} | dirty=${s.dirty} | pushed=${s.pushed}`);
  }
} else if (cmd === "rm" && name) {
  const path = existsSync(join(dir, name)) ? join(dir, name) : resolve(name);
  remove(path);
  git(["worktree", "prune"], root);
} else if (cmd === "prune") {
  for (const w of worktrees()) remove(w.worktree);
  git(["worktree", "prune"], root);
} else {
  console.error("usage: pnpm wt add <name> [--base <ref>] [--branch <branch>] | list | rm <name> | prune");
  process.exit(2);
}
