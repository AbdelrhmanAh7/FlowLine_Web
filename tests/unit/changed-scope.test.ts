import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { classifyScope, collectChanges, collectPaths, COMPARE_FILE_LIMIT, isDocsPath, PR_FILE_LIMIT } from "../../scripts/ci/changed-scope.mjs";

const script = fileURLToPath(new URL("../../scripts/ci/changed-scope.mjs", import.meta.url));

type Page = unknown;
const prPages = (files: string[]): Page[] => files.map((filename) => [{ filename }]);
const comparePage = (files: string[]): Page => ({ status: "ahead", commits: [], files: files.map((filename) => ({ filename })) });
// Later pages of a paginated compare result carry commits only: GitHub returns `files` on the first page (observed 2026-10-03).
const commitsOnlyPage = (): Page => ({ status: "ahead", total_commits: 174, commits: [{ sha: "abc" }] });
const docsFiles = (count: number) => Array.from({ length: count }, (_, i) => `docs/f${i}.md`);
const chunk = <T>(items: T[], size = 100): T[][] => {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
};
// A PR files listing arrives as many pages of 100 files each.
const prPagesOf = (files: string[]): Page[] => chunk(files.map((filename) => ({ filename })));
const renamedDocs = (count: number) => Array.from({ length: count }, (_, i) => ({ filename: `docs/new-${i}.md`, previous_filename: `docs/old-${i}.md`, status: "renamed" }));

const fixtures: { name: string; pages: Page[]; code: boolean }[] = [
  { name: "docs/ only", pages: prPages(["docs/DEVELOPER_GUIDE.md", "docs/design-system/forms.png"]), code: false },
  { name: "artifacts/ only, any extension", pages: prPages(["artifacts/phase-4/report.json", "artifacts/phase-4/shot.png"]), code: false },
  { name: "design-reference/ is code (unit tests read it), even Markdown", pages: prPages(["design-reference/slide-01.png", "design-reference/DESIGN-REFERENCE.md"]), code: true },
  { name: "root Markdown only", pages: prPages(["README.md", "AGENTS.md", "NEXT_ACTION.md"]), code: false },
  { name: "Markdown at any depth", pages: prPages([".github/pull_request_template.md", "src/server/NOTES.md", "tests/unit/README.md"]), code: false },
  { name: "all docs categories together", pages: prPages(["docs/a.md", "artifacts/b.txt", "README.md", "src/server/NOTES.md"]), code: false },
  { name: "code plus docs", pages: prPages(["src/app/page.tsx", "docs/guide.md"]), code: true },
  { name: "code only", pages: prPages(["src/app/page.tsx"]), code: true },
  { name: "workflow change is code", pages: prPages([".github/workflows/gate.yml", "docs/guide.md"]), code: true },
  { name: "root config is code", pages: prPages(["package.json", "README.md"]), code: true },
  { name: "unknown root file is code", pages: prPages(["LICENSE"]), code: true },
  { name: "non-Markdown file in docs lookalike dir is code", pages: prPages(["docsx/page.txt", "mydocs/page.txt", "doc/page.txt"]), code: true },
  { name: "file named docs is code", pages: prPages(["docs"]), code: true },
  { name: "matching is case-sensitive", pages: prPages(["Docs/page.txt", "README.MD"]), code: true },
  { name: "non-Markdown suffix lookalike is code", pages: prPages(["src/a.md.ts", "src/b.mdx", "src/c.markdown"]), code: true },
  { name: "filenames with spaces", pages: prPages(["docs/developer guide.md", "artifacts/phase 4/report.json"]), code: false },
  { name: "code filename with spaces", pages: prPages(["src/a file.ts", "docs/guide.md"]), code: true },
  { name: "newline in a code filename cannot fake a docs path", pages: prPages(["src/a.ts\ndocs/fake.md.txt"]), code: true },
  { name: "docs-looking line after a newline does not make a root file docs", pages: prPages(["package.json\ndocs/a.md.txt"]), code: true },
  { name: "rename within docs", pages: [[{ filename: "docs/new.md", previous_filename: "docs/old.md", status: "renamed" }]], code: false },
  { name: "rename from code into docs is code", pages: [[{ filename: "docs/moved.md", previous_filename: "src/moved.ts", status: "renamed" }]], code: true },
  { name: "rename from docs into code is code", pages: [[{ filename: "src/moved.ts", previous_filename: "docs/moved.md", status: "renamed" }]], code: true },
  { name: "null previous_filename is ignored", pages: [[{ filename: "docs/a.md", previous_filename: null }]], code: false },
  { name: "compare API pages, docs-only", pages: [comparePage(["docs/a.md"]), comparePage(["README.md"])], code: false },
  { name: "compare API pages, code on the last page", pages: [comparePage(["docs/a.md"]), comparePage(["src/lib.ts"])], code: true },
  { name: "mixed PR and compare page shapes", pages: [[{ filename: "docs/a.md" }], comparePage(["src/lib.ts"])], code: true },
  { name: "no pages", pages: [], code: true },
  { name: "empty pages", pages: [[], comparePage([])], code: true },
  // Compare API: 300 files is the cap, so a result that size may be truncated (CodeRabbit, PR #20).
  { name: "compare: 299 docs-only files are docs-only", pages: [comparePage(docsFiles(COMPARE_FILE_LIMIT - 1))], code: false },
  { name: "compare: 300 docs-only files are treated as code", pages: [comparePage(docsFiles(COMPARE_FILE_LIMIT))], code: true },
  { name: "compare: 301 docs-only files are treated as code", pages: [comparePage(docsFiles(COMPARE_FILE_LIMIT + 1))], code: true },
  { name: "compare: 3000 docs-only files are treated as code", pages: [comparePage(docsFiles(PR_FILE_LIMIT))], code: true },
  { name: "compare: later commit-only pages do not break a docs-only first page", pages: [comparePage(docsFiles(3)), commitsOnlyPage(), commitsOnlyPage()], code: false },
  { name: "compare: later commit-only pages do not hide the 300-file cap", pages: [comparePage(docsFiles(COMPARE_FILE_LIMIT)), commitsOnlyPage()], code: true },
  { name: "compare: code on the first page with commit-only pages after it", pages: [comparePage(["src/a.ts"]), commitsOnlyPage()], code: true },
  { name: "compare: commit-only pages without any file list are code", pages: [commitsOnlyPage(), commitsOnlyPage()], code: true },
  { name: "compare: the same 299 files repeated on two pages are not double counted", pages: [comparePage(docsFiles(COMPARE_FILE_LIMIT - 1)), comparePage(docsFiles(COMPARE_FILE_LIMIT - 1))], code: false },
  { name: "compare: 299 docs-to-docs renames (598 paths) are 299 files, so docs-only", pages: [{ status: "ahead", commits: [], files: renamedDocs(COMPARE_FILE_LIMIT - 1) }], code: false },
  { name: "compare: 300 docs-to-docs renames are treated as code", pages: [{ status: "ahead", commits: [], files: renamedDocs(COMPARE_FILE_LIMIT) }], code: true },
  // PR files API: 3000 is the cap; the compare cap of 300 does not apply to it.
  { name: "PR: 300 docs-only files are docs-only", pages: prPagesOf(docsFiles(COMPARE_FILE_LIMIT)), code: false },
  { name: "PR: 2999 docs-only files are docs-only", pages: prPagesOf(docsFiles(PR_FILE_LIMIT - 1)), code: false },
  { name: "PR: 3000 docs-only files are treated as code", pages: prPagesOf(docsFiles(PR_FILE_LIMIT)), code: true },
  { name: "PR: 3000 docs-only files on one page are treated as code", pages: [docsFiles(PR_FILE_LIMIT).map((filename) => ({ filename }))], code: true },
  { name: "PR: 1500 docs-to-docs renames (3000 paths) are 1500 files, so docs-only", pages: chunk(renamedDocs(1500)), code: false },
  { name: "PR: 3000 docs-to-docs renames are treated as code", pages: chunk(renamedDocs(PR_FILE_LIMIT)), code: true },
  { name: "PR: 2999 docs files plus a compare-shaped page of 299 are each under their limit", pages: [...prPagesOf(docsFiles(PR_FILE_LIMIT - 1)), comparePage(docsFiles(COMPARE_FILE_LIMIT - 1))], code: false },
];

const run = (input: string, args: string[] = [], env: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "changed-scope-"));
  const output = join(dir, "output");
  const summary = join(dir, "summary");
  writeFileSync(output, "");
  writeFileSync(summary, "");
  try {
    const result = spawnSync(process.execPath, [script, ...args], {
      input,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...env },
    });
    expect(result.error).toBeUndefined();
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: readFileSync(output, "utf8"), summary: readFileSync(summary, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("changed-scope CLI fixtures", () => {
  it.each(fixtures)("$name", ({ pages, code }) => {
    // Pages go through the same JSON transport the workflow uses (`gh api --paginate --slurp`).
    const result = run(JSON.stringify(pages));
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe(`code=${code}\n`);
    expect(result.summary).toContain("## Change scope");
    expect(result.summary).toContain(`code=${code}`);
    if (code) expect(result.summary).not.toContain("docs-only change: test jobs skipped by design");
    else expect(result.summary).toContain("docs-only change: test jobs skipped by design");
  });

  it("writes only the fixed code= line to GITHUB_OUTPUT, never a file name", () => {
    const result = run(JSON.stringify(prPages(["src/evil\ncode=false.ts", "docs/a.md"])));
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe("code=true\n");
    expect(result.summary).toContain(JSON.stringify("src/evil\ncode=false.ts"));
  });

  it("prints to stdout when the GitHub files are not provided", () => {
    const result = run(JSON.stringify(prPages(["docs/a.md"])), [], { GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: "" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("## Change scope");
    expect(result.stdout).toContain("code=false\n");
  });

  it("limits the code file list in the summary", () => {
    const result = run(JSON.stringify([Array.from({ length: 25 }, (_, i) => ({ filename: `src/f${i}.ts` }))]));
    expect(result.summary).toContain("Code files changed: 25");
    expect(result.summary).toContain("- ... and 15 more");
    expect(result.summary).not.toContain("src/f24.ts");
  });

  it("assumes code when GitHub may have truncated the file list", () => {
    const files = Array.from({ length: PR_FILE_LIMIT }, (_, i) => ({ filename: `docs/f${i}.md` }));
    const result = run(JSON.stringify([files]));
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe("code=true\n");
    expect(result.summary).toContain("list may be truncated");
    expect(classifyScope(files.slice(1).map((file) => file.filename)).code).toBe(false);
  });

  it("--assume-code skips classification and ignores stdin", () => {
    const result = run("not json", ["--assume-code=workflow_dispatch runs the explicit tier"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe("code=true\n");
    expect(result.summary).toContain("assuming code: workflow_dispatch runs the explicit tier");
  });

  it("--assume-code without a reason still assumes code", () => {
    const result = run("", ["--assume-code="]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe("code=true\n");
    expect(result.summary).toContain("assuming code: no reason given");
  });

  it.each([
    { name: "invalid JSON", input: "{not json" },
    { name: "empty input", input: "" },
    { name: "an object instead of pages", input: "{}" },
    { name: "a page that is neither array nor compare object", input: JSON.stringify([{ message: "Not Found" }]) },
    { name: "a page of strings", input: JSON.stringify([["docs/a.md"]]) },
    { name: "a file without a filename", input: JSON.stringify([[{ status: "added" }]]) },
    { name: "an empty filename", input: JSON.stringify([[{ filename: "" }]]) },
    { name: "an invalid previous_filename", input: JSON.stringify([[{ filename: "docs/a.md", previous_filename: 7 }]]) },
    { name: "an empty previous_filename", input: JSON.stringify([[{ filename: "docs/a.md", previous_filename: "" }]]) },
  ])("fails closed on $name without writing an output", ({ input }) => {
    const result = run(input);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error::Change scope check failed");
    expect(result.output).toBe("");
  });

  it("rejects unknown arguments without writing an output", () => {
    const result = run(JSON.stringify(prPages(["docs/a.md"])), ["--assume-docs"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown argument");
    expect(result.output).toBe("");
  });

  it("keeps an error message on one workflow-command line", () => {
    const result = run(JSON.stringify([{ message: "x" }]));
    expect(result.stderr.trim().split(/\r?\n/)).toHaveLength(1);
  });
});

describe("GitHub file-list caps", () => {
  const warning = (stderr: string) => stderr.split(/\r?\n/).filter((line) => line.startsWith("::warning::"));

  it("has the documented limits: 3000 for a PR, 300 for a comparison", () => {
    expect(PR_FILE_LIMIT).toBe(3000);
    expect(COMPARE_FILE_LIMIT).toBe(300);
  });

  it("warns once, with counts only, and runs the tests when a compare result reaches 300 files", () => {
    const result = run(JSON.stringify([comparePage(docsFiles(COMPARE_FILE_LIMIT)), commitsOnlyPage()]));
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe("code=true\n");
    expect(warning(result.stderr)).toEqual([
      "::warning::300 files listed, list may be truncated (GitHub lists at most 300 files per comparison), so the test jobs run.",
    ]);
    expect(result.stderr.trim().split(/\r?\n/)).toHaveLength(1);
    expect(result.summary).toContain("code=true");
    expect(result.summary).toContain("300 files listed, list may be truncated (GitHub lists at most 300 files per comparison), assuming code");
    expect(result.summary).not.toContain("docs-only change: test jobs skipped by design");
  });

  it("does not warn for 299 compare files, which stay docs-only", () => {
    const result = run(JSON.stringify([comparePage(docsFiles(COMPARE_FILE_LIMIT - 1)), commitsOnlyPage()]));
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe("code=false\n");
    expect(result.stderr).toBe("");
    expect(result.summary).toContain("docs-only change: test jobs skipped by design");
  });

  it("also warns when a PR file list reaches 3000, but not at 300 or 2999", () => {
    const at = run(JSON.stringify(prPagesOf(docsFiles(PR_FILE_LIMIT))));
    expect(at.output).toBe("code=true\n");
    expect(warning(at.stderr)).toEqual([
      "::warning::3000 files listed, list may be truncated (GitHub lists at most 3000 files per pull request), so the test jobs run.",
    ]);
    for (const count of [COMPARE_FILE_LIMIT, PR_FILE_LIMIT - 1]) {
      const below = run(JSON.stringify(prPagesOf(docsFiles(count))));
      expect(below.output, `${count} PR files`).toBe("code=false\n");
      expect(below.stderr, `${count} PR files`).toBe("");
    }
  });

  it("warns at the cap even when a code file is already visible, and still reports code files", () => {
    const result = run(JSON.stringify([comparePage([...docsFiles(COMPARE_FILE_LIMIT - 1), "src/lib.ts"])]));
    expect(result.output).toBe("code=true\n");
    expect(warning(result.stderr)).toHaveLength(1);
    expect(result.summary).toContain("(code files changed)");
    expect(result.summary).toContain(JSON.stringify("src/lib.ts"));
  });

  it("never puts a file name or newline into the warning", () => {
    const names = Array.from({ length: COMPARE_FILE_LIMIT }, (_, i) => `docs/evil\n::error::x${i}.md`);
    const result = run(JSON.stringify([comparePage(names)]));
    expect(result.output).toBe("code=true\n");
    expect(result.stderr).not.toContain("evil");
    expect(result.stderr.trim().split(/\r?\n/)).toHaveLength(1);
  });

  it("counts compare entries by distinct filename and PR entries across pages", () => {
    const compare = collectChanges([comparePage(docsFiles(5)), comparePage(docsFiles(5)), commitsOnlyPage()]);
    expect(compare).toMatchObject({ prFiles: 0, compareFiles: 5 });
    expect(compare.paths).toHaveLength(10);
    expect(collectChanges(prPagesOf(docsFiles(250)))).toMatchObject({ prFiles: 250, compareFiles: 0 });
    expect(collectChanges([[{ filename: "docs/b.md", previous_filename: "docs/a.md" }]])).toMatchObject({ prFiles: 1, compareFiles: 0 });
  });

  it("classifyScope applies the limit that matches the listing it was given", () => {
    const paths = docsFiles(COMPARE_FILE_LIMIT);
    expect(classifyScope(paths).code).toBe(false);
    expect(classifyScope(paths, { prFiles: 0, compareFiles: COMPARE_FILE_LIMIT })).toMatchObject({ code: true, warning: expect.stringContaining("per comparison") });
    expect(classifyScope(paths, { prFiles: 0, compareFiles: COMPARE_FILE_LIMIT - 1 })).toMatchObject({ code: false, warning: null });
    expect(classifyScope(paths, { prFiles: PR_FILE_LIMIT, compareFiles: 0 })).toMatchObject({ code: true, warning: expect.stringContaining("per pull request") });
  });
});

describe("classifier", () => {
  it.each(["docs/a.md", "docs/x/y/z.png", "artifacts/a", "README.md", "a/b/c.md"])("%s is docs", (file) => {
    expect(isDocsPath(file)).toBe(true);
  });

  it.each(["src/a.ts", "package.json", ".github/workflows/gate.yml", "docs", "docs.txt", "README.MD", "a.md.txt", "Docs/a.txt", "design-reference/a.png", "design-reference/DESIGN-REFERENCE.md"])("%s is code", (file) => {
    expect(isDocsPath(file)).toBe(false);
  });

  it("deduplicates paths and lists docs and code files separately", () => {
    const result = classifyScope(["src/a.ts", "src/a.ts", "docs/a.md"]);
    expect(result).toMatchObject({ code: true, codeFiles: ["src/a.ts"], docsFiles: ["docs/a.md"] });
  });

  it("collects the old path of a rename", () => {
    expect(collectPaths([[{ filename: "docs/b.md", previous_filename: "src/b.ts" }]])).toEqual(["docs/b.md", "src/b.ts"]);
  });
});
