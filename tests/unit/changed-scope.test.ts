import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { classifyScope, collectPaths, FILE_LIST_LIMIT, isDocsPath } from "../../scripts/ci/changed-scope.mjs";

const script = fileURLToPath(new URL("../../scripts/ci/changed-scope.mjs", import.meta.url));

type Page = unknown;
const prPages = (files: string[]): Page[] => files.map((filename) => [{ filename }]);
const comparePage = (files: string[]): Page => ({ status: "ahead", commits: [], files: files.map((filename) => ({ filename })) });

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
    const files = Array.from({ length: FILE_LIST_LIMIT }, (_, i) => ({ filename: `docs/f${i}.md` }));
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
