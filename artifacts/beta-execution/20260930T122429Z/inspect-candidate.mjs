import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const out = "artifacts/beta-execution/20260930T122429Z";
const checkpoint = JSON.parse(readFileSync("artifacts/design-v2/gate/final-keyboard/checkpoint-20.json", "utf8"));
const index = path.join(mkdtempSync(path.join(tmpdir(), "fl-beta-inspect-")), "index");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", env: { ...process.env, GIT_INDEX_FILE: index }, stdio: ["pipe", "pipe", "pipe"] }).trim();
writeFileSync(`${out}/worktree-status.txt`, git("status", "--short", "--untracked-files=all") + "\n");
git("read-tree", "HEAD");
git("add", "--", ...Object.keys(checkpoint.inputs));
const tree = git("write-tree");
const actual = Object.fromEntries(Object.keys(checkpoint.inputs).map(p => [p, git("rev-parse", `${tree}:${p}`)]));
const delta = Object.keys(actual).filter(p => actual[p] !== checkpoint.inputs[p]);
writeFileSync(`${out}/candidate-identity.json`, JSON.stringify({ inspectedAt: new Date().toISOString(), branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD"), checkpoint: checkpoint.commit, executionTree: tree, inputs: actual, changedFromCheckpoint: delta, intentionalDelta: "tests/unit/dialog-focus.test.ts: verify shared closeRun clears run and disables auto-selection; product/e2e inputs unchanged" }, null, 2));
console.log(JSON.stringify({ checkpoint: checkpoint.commit, changedInputs: delta, productMatches: actual.src === checkpoint.inputs.src, e2eMatches: actual.e2e === checkpoint.inputs.e2e }));
