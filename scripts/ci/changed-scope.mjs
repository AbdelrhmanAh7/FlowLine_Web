#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Gate scope (AGENTS.md "Gates before commit"): a change set is docs-only when every path is under docs/ or artifacts/,
// or is a *.md file at any depth. design-reference/ always counts as code, because unit tests read it
// (tests/unit/design-system.test.ts reads DESIGN-REFERENCE.md). Anything else, including unknown root files, counts as
// code on purpose, so the test jobs run unless a change is provably docs-only. Matching is case-sensitive (README.MD is code).
const docsDirs = ["docs/", "artifacts/"];
const testedDirs = ["design-reference/"];
// GitHub lists at most 3000 files per PR or comparison; at that size the list may be truncated, so assume code.
export const FILE_LIST_LIMIT = 3000;
const SUMMARY_FILES = 10;

export const isDocsPath = (file) =>
  !testedDirs.some((dir) => file.startsWith(dir)) && (docsDirs.some((dir) => file.startsWith(dir)) || file.endsWith(".md"));

// Both the PR files API and the compare API list a rename with its old path too, so moving code into docs is code.
export function classifyScope(paths) {
  const unique = [...new Set(paths)];
  const codeFiles = unique.filter((file) => !isDocsPath(file));
  const docsFiles = unique.filter(isDocsPath);
  let code = true;
  let reason = "code files changed";
  if (paths.length === 0) reason = "no changed files reported, assuming code";
  else if (paths.length >= FILE_LIST_LIMIT) reason = `${paths.length} files listed, list may be truncated, assuming code`;
  else if (codeFiles.length === 0) {
    code = false;
    reason = "docs-only change";
  }
  return { code, reason, codeFiles, docsFiles };
}

// `gh api --paginate --slurp` yields an array of pages. A PR files page is an array of files; a compare page is an
// object with a `files` array. Anything else fails closed.
export function collectPaths(pages) {
  if (!Array.isArray(pages)) throw new Error("expected paginated changed-files JSON");
  const paths = [];
  for (const page of pages) {
    const files = Array.isArray(page) ? page : Array.isArray(page?.files) ? page.files : null;
    if (!files) throw new Error("expected paginated changed-files JSON");
    for (const file of files) {
      if (typeof file?.filename !== "string" || file.filename === "") throw new Error("changed file without a filename");
      paths.push(file.filename);
      // GitHub omits previous_filename unless the file was renamed; null is tolerated as absent.
      if (file.previous_filename != null) {
        if (typeof file.previous_filename !== "string" || file.previous_filename === "") throw new Error("changed file with an invalid previous_filename");
        paths.push(file.previous_filename);
      }
    }
  }
  return paths;
}

export function scopeSummary({ code, reason, codeFiles, docsFiles }) {
  return [
    "## Change scope", "", `Result: \`code=${code}\` (${reason})`,
    `Code files changed: ${codeFiles.length}`, `Docs-only files changed: ${docsFiles.length}`,
    ...codeFiles.slice(0, SUMMARY_FILES).map((file) => `- ${JSON.stringify(file)}`),
    ...(codeFiles.length > SUMMARY_FILES ? [`- ... and ${codeFiles.length - SUMMARY_FILES} more`] : []),
    ...(code ? [] : ["", "docs-only change: test jobs skipped by design"]),
  ].join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // --assume-code=<reason> skips classification (explicit tier runs, pushes without a usable base commit).
    const args = process.argv.slice(2);
    const unknown = args.filter((arg) => !arg.startsWith("--assume-code="));
    if (unknown.length > 0) throw new Error(`unknown argument ${JSON.stringify(unknown[0])}`);
    const assumed = args.length > 0 ? args[args.length - 1].slice("--assume-code=".length) : null;
    const result = assumed !== null
      ? { code: true, reason: `assuming code: ${assumed || "no reason given"}`, codeFiles: [], docsFiles: [] }
      : classifyScope(collectPaths(JSON.parse(readFileSync(0, "utf8"))));
    const summary = scopeSummary(result);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    else process.stdout.write(summary);
    // Only the fixed `code=true|false` line reaches GITHUB_OUTPUT; no file name or reason is ever written there.
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `code=${result.code}\n`);
    else process.stdout.write(`code=${result.code}\n`);
  } catch (error) {
    // One line only: an error message must never be able to start a second workflow command.
    console.error(`::error::Change scope check failed: ${String(error.message).replace(/[\r\n]+/g, " ")}`);
    process.exitCode = 1;
  }
}
