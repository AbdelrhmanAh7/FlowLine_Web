import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { checkDocs } from "../../scripts/ci/docs-check.mjs";

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
];

describe("docs check CLI fixtures", () => {
  it.each(fixtures)("$name", ({ files, waived, body, pass }) => {
    // Separate pages exercise the same JSON transport used by the workflow.
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify(files.map((filename) => [{ filename }])),
      encoding: "utf8",
      env: { ...process.env, WAIVED: String(waived ?? false), PR_BODY: body ?? "", GITHUB_STEP_SUMMARY: "" },
    });
    expect(result.error).toBeUndefined();
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
