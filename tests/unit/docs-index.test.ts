import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../docs/${name}`, import.meta.url)), "utf8");
const tableLines = (text: string) => text.split("\n").filter((line) => line.startsWith("|"));

describe("docs index and PR #159 docs", () => {
  it("keeps vision.md a draft until the owner approves it", () => {
    const row = tableLines(read("README.md")).find((line) => line.includes("[vision.md](vision.md)"));
    expect(row).toBeDefined();
    const cells = row!.split("|").slice(1, -1).map((c) => c.trim());
    expect(cells[2]).toBe("yes");
    expect(cells[3]).toBe("draft");
  });

  it.each(["README.md", "vision.md", "backlog-restructure.md"])("%s has no malformed '||' table rows and consistent columns", (name) => {
    const lines = tableLines(read(name));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.startsWith("||")).toBe(false);
    // Within each contiguous table block every row has the header's column count.
    let width = 0;
    let prevWasTable = false;
    for (const line of read(name).split("\n")) {
      if (!line.startsWith("|")) { prevWasTable = false; continue; }
      const cols = line.replace(/\\\|/g, "").split("|").length - 2;
      if (!prevWasTable) width = cols; else expect(cols, line).toBe(width);
      prevWasTable = true;
    }
  });
});

describe("security posture docs and shell command safety (#107)", () => {
  const repoRoot = (name: string) => readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf8");

  it("AGENTS.md links to REPO_SECURITY_SETTINGS.md as a navigation reference", () => {
    const agents = repoRoot("AGENTS.md");
    // Verifies markdown link exists in the Security posture PR requirement section
    expect(agents).toMatch(/\[`?docs\/security\/REPO_SECURITY_SETTINGS\.md`?\]\(docs\/security\/REPO_SECURITY_SETTINGS\.md\)/);
  });

  it("docs/security/REPO_SECURITY_SETTINGS.md uses ${PR_NUMBER:-123} default example value and has no unescaped angle brackets", () => {
    const doc = read("security/REPO_SECURITY_SETTINGS.md");
    expect(doc).toContain("${PR_NUMBER:-123}");
    expect(doc).not.toContain("${PR_NUMBER:?set PR_NUMBER first}");
    expect(doc).not.toContain("<PR_NUMBER>");

    // Check code blocks have no raw angle bracket placeholders
    const shMatches = doc.match(/```sh\n([\s\S]*?)\n```/g) ?? [];
    for (const block of shMatches) {
      expect(block).not.toMatch(/<[^>]+>/);
    }
  });

  it("docs/security/REPO_SECURITY_SETTINGS.md accurately summarizes enabled settings and ready PRs", () => {
    const doc = read("security/REPO_SECURITY_SETTINGS.md");
    expect(doc).not.toMatch(/enabled the first four/i);
    expect(doc).toMatch(/the settings shown as enabled below/i);
    expect(doc).toMatch(/next non-draft or ready-for-review PR into main/i);
  });
});

