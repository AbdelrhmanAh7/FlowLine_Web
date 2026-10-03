import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { checkDocs, FILE_LIST_LIMIT, isPlaceholderReason } from "../../scripts/ci/docs-check.mjs";

const script = fileURLToPath(new URL("../../scripts/ci/docs-check.mjs", import.meta.url));
const fixtures = [
  { name: "code plus docs", files: ["src/app/page.tsx", "docs/guide.md"], pass: true },
  { name: "code only", files: ["src/app/page.tsx"], pass: false },
  { name: "waiver plus reason", files: ["scripts/fix.mjs"], waived: true, body: "## Docs\nDocs not needed because: Internal refactor only.\n", pass: true },
  { name: "waiver plus empty reason", files: ["tests/unit/example.test.ts"], waived: true, body: "Docs not needed because:", pass: false },
  { name: "waiver plus whitespace reason", files: ["worker/index.ts"], waived: true, body: "Docs not needed because: \t\r\n## Checks", pass: false },
  { name: "waiver without body", files: ["src/file.ts"], waived: true, pass: false },
  { name: "reason without label", files: ["src/file.ts"], body: "Docs not needed because: Internal refactor.", pass: false },
  { name: "freeform explanation", files: ["src/file.ts"], waived: true, body: "Docs: no changes needed.", pass: false },
  { name: "quoted format example", files: ["src/file.ts"], waived: true, body: "Use `Docs not needed because: <reason>`.", pass: false },
  { name: "reason on the next line", files: ["src/file.ts"], waived: true, body: "Docs not needed because:\nInternal refactor.", pass: false },
  { name: "only artifacts Markdown with code", files: ["src/file.ts", "artifacts/phase-4/report.md"], pass: false },
  { name: "root config", files: ["vitest.config.mts"], pass: false },
  { name: "filenames with spaces", files: ["src/a file.ts", "docs/developer guide.md"], pass: true },
  { name: "code filename with spaces", files: ["src/a file.ts"], pass: false },
  { name: "newline in code filename cannot fake docs", files: ["src/a.ts\nfake.md.txt"], pass: false },
  { name: "docs only", files: ["README.md"], pass: true },
  { name: "body is inert data", files: ["src/file.ts"], waived: true, body: "Docs not needed because: $(exit 99) `exit 99` ${{ github.token }}", pass: true },
  // The unfilled template placeholder is not a reason (CodeRabbit, PR #20).
  { name: "template placeholder as shown", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <reason>", pass: false },
  { name: "template placeholder without a space after the colon", files: ["src/file.ts"], waived: true, body: "Docs not needed because:<reason>", pass: false },
  { name: "template placeholder with inner spaces", files: ["src/file.ts"], waived: true, body: "Docs not needed because: < reason >", pass: false },
  { name: "template placeholder in capitals", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <REASON>", pass: false },
  { name: "template placeholder with surrounding whitespace", files: ["src/file.ts"], waived: true, body: "Docs not needed because:  \t <Reason> \t ", pass: false },
  { name: "template placeholder with CRLF line ending", files: ["src/file.ts"], waived: true, body: "## Docs\r\nDocs not needed because: <reason>\r\n## Checks\r\n", pass: false },
  { name: "template placeholder in backticks", files: ["src/file.ts"], waived: true, body: "Docs not needed because: `<reason>`", pass: false },
  { name: "template placeholder with trailing period", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <reason>.", pass: false },
  { name: "bare word reason", files: ["src/file.ts"], waived: true, body: "Docs not needed because: reason", pass: false },
  { name: "bare word Reason with a period", files: ["src/file.ts"], waived: true, body: "Docs not needed because: Reason.", pass: false },
  { name: "another lone angle-bracket placeholder", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <explain why>", pass: false },
  { name: "an empty angle-bracket pair", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <>", pass: false },
  { name: "placeholder line among other lines", files: ["src/file.ts"], waived: true, body: "Notes\nDocs not needed because: <reason>\nMore notes\n", pass: false },
  { name: "a real reason on a later line still waives", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <reason>\nDocs not needed because: Test-only refactor.", pass: true },
  { name: "reason that starts with the word reason", files: ["src/file.ts"], waived: true, body: "Docs not needed because: reason is internal only", pass: true },
  { name: "plural reasons", files: ["src/file.ts"], waived: true, body: "Docs not needed because: reasons are in the PR description", pass: true },
  { name: "template placeholder left inside a longer sentence", files: ["src/file.ts"], waived: true, body: "Docs not needed because: internal refactor, no <reason> to document", pass: false },
  { name: "template placeholder after a partial edit", files: ["src/file.ts"], waived: true, body: "Docs not needed because: <Reason > TBD", pass: false },
  { name: "placeholder waiver is irrelevant when docs changed", files: ["src/file.ts", "docs/guide.md"], waived: true, body: "Docs not needed because: <reason>", pass: true },
];

const pageOf = (files: string[], size = 100) => {
  const pages: { filename: string }[][] = [];
  for (let i = 0; i < files.length; i += size) pages.push(files.slice(i, i + size).map((filename) => ({ filename })));
  return pages;
};
const artifactFiles = (count: number) => Array.from({ length: count }, (_, i) => `artifacts/phase-4/shot-${i}.png`);
const runCli = (pages: unknown, { waived, body }: { waived?: boolean; body?: string } = {}) => {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(pages),
    encoding: "utf8",
    env: { ...process.env, WAIVED: String(waived ?? false), PR_BODY: body ?? "", GITHUB_STEP_SUMMARY: "" },
  });
  expect(result.error).toBeUndefined();
  return result;
};

describe("docs check CLI fixtures", () => {
  it.each(fixtures)("$name", ({ files, waived, body, pass }) => {
    // Separate pages exercise the same JSON transport used by the workflow.
    const result = runCli(files.map((filename) => [{ filename }]), { waived, body });
    expect(result.status, result.stderr).toBe(pass ? 0 : 1);
    expect(result.stdout).toContain("## Docs check");
    if (!pass) expect(result.stderr).toContain("::error::");
  });

  it("fails closed on malformed API output", () => {
    const result = spawnSync(process.execPath, [script], { input: "{}", encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected paginated PR files JSON");
  });
});

describe("GitHub's 3000-file PR list limit fails closed", () => {
  const nearLimit = artifactFiles(FILE_LIST_LIMIT - 1);
  const atLimit = artifactFiles(FILE_LIST_LIMIT);

  it("treats exactly 3000 files with no visible code or docs as code, so it fails without docs or a waiver", () => {
    expect(FILE_LIST_LIMIT).toBe(3000);
    const result = runCli(pageOf(atLimit));
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("Code files changed: 0");
    expect(result.stdout).toContain("File list has 3000 entries");
    expect(result.stdout).toContain("may be truncated: assuming code changed");
    expect(result.stderr).toContain("::warning::The PR file list reached GitHub's 3000-file limit");
    expect(result.stderr).toContain("::error::This PR lists 3000 files or more, so code is assumed changed");
  });

  it("passes 3000 files when one is a visible Markdown doc outside artifacts/", () => {
    const result = runCli(pageOf([...atLimit.slice(1), "docs/DEVELOPER_GUIDE.md"]));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Docs changed: 1");
    expect(result.stdout).toContain("may be truncated: assuming code changed");
    expect(result.stderr).toContain("::warning::");
    expect(result.stderr).not.toContain("::error::");
  });

  it("still requires docs at 3000 files when the only Markdown is under artifacts/", () => {
    const result = runCli(pageOf([...atLimit.slice(1), "artifacts/phase-4/report.md"]));
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("Docs changed: 0");
  });

  it("accepts a valid waiver at 3000 files, but not the template placeholder or a label alone", () => {
    const waived = runCli(pageOf(atLimit), { waived: true, body: "Docs not needed because: Generated evidence only." });
    expect(waived.status, waived.stderr).toBe(0);
    expect(waived.stdout).toContain("Waived by docs-not-needed");
    expect(runCli(pageOf(atLimit), { waived: true, body: "Docs not needed because: <reason>" }).status).toBe(1);
    expect(runCli(pageOf(atLimit), { waived: true, body: "" }).status).toBe(1);
  });

  it("does not treat 2999 files as truncated, so a list without code passes", () => {
    const result = runCli(pageOf(nearLimit));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("truncated");
    expect(result.stderr).toBe("");
  });

  it("counts entries across pages, whatever the page size", () => {
    expect(pageOf(atLimit, 100)).toHaveLength(30);
    expect(runCli(pageOf(atLimit, 100)).status).toBe(1);
    expect(runCli(pageOf(atLimit, 1000)).status).toBe(1);
    expect(runCli(pageOf(nearLimit, 100)).status).toBe(0);
  });

  it("checkDocs reports the truncation and assumes code although no file matched a code path", () => {
    expect(checkDocs(atLimit)).toMatchObject({ passed: false, truncated: true });
    expect(checkDocs(nearLimit)).toMatchObject({ passed: true, truncated: false });
    expect(checkDocs([...atLimit.slice(1), "README.md"])).toMatchObject({ passed: true, truncated: true });
  });
});

describe("waiver placeholder", () => {
  it.each([
    "<reason>", "< reason >", "<REASON>", "<Reason>", "  <reason>  ", "\t<reason>\t", "`<reason>`", "\"<reason>\"", "'<reason>'", "**<reason>**",
    "<reason>.", "<reason>!", "reason", "Reason", "REASON.", "<explain why>", "<>", "<your reason here>", " < reason > ",
    // The template's <reason> token left anywhere in the text is still an unfilled template.
    "no <reason> to document", "see <reason> and <more>", "x<reason>", "<Reason > TBD",
  ])("%j is an unfilled template", (reason) => {
    expect(isPlaceholderReason(reason)).toBe(true);
  });

  it.each([
    "Internal refactor only", "reasons are in the PR description", "reason is internal only",
    "Test-only change", "<b>bold</b> text in a comment", "a < b and c > d", "unreasonable", "<reasoning> is in the linked issue",
  ])("%j is a real reason", (reason) => {
    expect(isPlaceholderReason(reason)).toBe(false);
  });
});

describe("root code/config coverage", () => {
  it.each([
    "Dockerfile", "Dockerfile.worker", "docker-compose.yml", "docker-compose.staging.yml",
    "next.config.ts", "tsconfig.json", "tsconfig.test.json", "drizzle.config.ts",
    "vitest.config.mts", "playwright.config.ts", "pnpm-lock.yaml", "package.json",
    "eslint.config.mjs", "postcss.config.mjs", "custom.config.ts", "custom.config.js", "custom.config.cjs",
  ])("requires docs for %s", (filename) => {
    expect(checkDocs([filename]).passed).toBe(false);
  });

  it.each(["docs/custom.config.ts", "artifacts/Dockerfile", "Dockerfile/example.md.txt"])("root patterns do not match %s", (filename) => {
    expect(checkDocs([filename]).summary).toContain("Code files changed: 0");
  });
});
