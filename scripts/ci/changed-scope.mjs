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
// GitHub caps the file lists it returns: at most 3000 files for a PR (pulls/N/files) and at most 300 for a comparison
// (compare/A...B). At the cap the list may be truncated, so it is treated as code. The compare API ignores
// `--paginate` for `files`: only the first page carries them (later pages have commits only), still capped at 300.
export const PR_FILE_LIMIT = 3000;
export const COMPARE_FILE_LIMIT = 300;
const SUMMARY_FILES = 10;

export const isDocsPath = (file) =>
  !testedDirs.some((dir) => file.startsWith(dir)) && (docsDirs.some((dir) => file.startsWith(dir)) || file.endsWith(".md"));

const truncation = (listed, limit, what) => `${listed} files listed, list may be truncated (GitHub lists at most ${limit} files per ${what})`;

// Both the PR files API and the compare API list a rename with its old path too, so moving code into docs is code.
// `listed` counts the entries GitHub returned (a rename is one entry but two paths); without it `paths` is taken as a PR list.
export function classifyScope(paths, listed = { prFiles: paths.length, compareFiles: 0 }) {
  const unique = [...new Set(paths)];
  const codeFiles = unique.filter((file) => !isDocsPath(file));
  const docsFiles = unique.filter(isDocsPath);
  let warning = null;
  if (listed.prFiles >= PR_FILE_LIMIT) warning = truncation(listed.prFiles, PR_FILE_LIMIT, "pull request");
  else if (listed.compareFiles >= COMPARE_FILE_LIMIT) warning = truncation(listed.compareFiles, COMPARE_FILE_LIMIT, "comparison");
  let code = true;
  let reason = "code files changed";
  if (codeFiles.length === 0) {
    if (paths.length === 0) reason = "no changed files reported, assuming code";
    else if (warning) reason = `${warning}, assuming code`;
    else {
      code = false;
      reason = "docs-only change";
    }
  }
  return { code, reason, warning, codeFiles, docsFiles };
}

// `gh api --paginate --slurp` yields an array of pages. A PR files page is an array of files. A compare page is an
// object with a `commits` array and, on the first page only, a `files` array. Anything else fails closed.
// Returns every path (a rename contributes both its names) and how many entries each API listed: PR entries are
// counted across pages, compare entries by distinct filename, so a repeated list is not counted twice.
export function collectChanges(pages) {
  if (!Array.isArray(pages)) throw new Error("expected paginated changed-files JSON");
  const paths = [];
  const compareNames = new Set();
  let prFiles = 0;
  for (const page of pages) {
    const isPr = Array.isArray(page);
    const isCompare = !isPr && page !== null && typeof page === "object" && (Array.isArray(page.files) || Array.isArray(page.commits));
    if (!isPr && !isCompare) throw new Error("expected paginated changed-files JSON");
    const files = isPr ? page : page.files ?? [];
    if (!Array.isArray(files)) throw new Error("expected paginated changed-files JSON");
    for (const file of files) {
      if (typeof file?.filename !== "string" || file.filename === "") throw new Error("changed file without a filename");
      paths.push(file.filename);
      if (isPr) prFiles += 1;
      else compareNames.add(file.filename);
      // GitHub omits previous_filename unless the file was renamed; null is tolerated as absent.
      if (file.previous_filename != null) {
        if (typeof file.previous_filename !== "string" || file.previous_filename === "") throw new Error("changed file with an invalid previous_filename");
        paths.push(file.previous_filename);
      }
    }
  }
  return { paths, prFiles, compareFiles: compareNames.size };
}

export const collectPaths = (pages) => collectChanges(pages).paths;

const classify = (pages) => {
  const { paths, prFiles, compareFiles } = collectChanges(pages);
  return classifyScope(paths, { prFiles, compareFiles });
};

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
      ? { code: true, reason: `assuming code: ${assumed || "no reason given"}`, warning: null, codeFiles: [], docsFiles: [] }
      : classify(JSON.parse(readFileSync(0, "utf8")));
    const summary = scopeSummary(result);
    // One fixed line with counts only (no file name), written whether or not the cap changed the outcome.
    if (result.warning) console.error(`::warning::${result.warning}, so the test jobs run.`);
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
