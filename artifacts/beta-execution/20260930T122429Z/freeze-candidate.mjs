import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const identity = JSON.parse(readFileSync("artifacts/beta-execution/20260930T122429Z/candidate-identity.json", "utf8"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const commit = git("commit-tree", identity.executionTree, "-p", identity.checkpoint, "-m", "design-v2 beta execution: cp20 product plus shared closeRun unit assertion");
const ref = "refs/checkpoints/design-v2-closeout-21";
git("update-ref", ref, commit, "0000000000000000000000000000000000000000");
writeFileSync("artifacts/beta-execution/20260930T122429Z/checkpoint-21.json", JSON.stringify({ ref, commit, tree: identity.executionTree, inputs: identity.inputs, parent: identity.checkpoint, coverage: "cp20 src/e2e unchanged; non-browser gate run on the recorded tests tree; no branch/index mutation" }, null, 2));
console.log(`Checkpoint 21: ${commit}; branch and real index unchanged`);
