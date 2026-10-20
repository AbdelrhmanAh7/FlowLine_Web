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

  it("indexes security/ACCOUNT_SECURITY.md and documents /account/security and two-factor card", () => {
    const row = tableLines(read("README.md")).find((line) => line.includes("[security/ACCOUNT_SECURITY.md](security/ACCOUNT_SECURITY.md)"));
    expect(row).toBeDefined();
    const cells = row!.split("|").slice(1, -1).map((c) => c.trim());
    expect(cells[0]).toBe("[security/ACCOUNT_SECURITY.md](security/ACCOUNT_SECURITY.md)");
    expect(cells[2]).toBe("yes");
    expect(cells[3]).toBe("approved");

    const content = read("security/ACCOUNT_SECURITY.md");
    expect(content).toContain("/account/security");
    expect(content.toLowerCase()).toContain("two-factor card");
    expect(content).toContain("TOTP (SHA-1، 6 أرقام، خطوة 30 ثانية");
    expect(content).toContain("cleared from the input on submit");
    expect(content).toContain("src/server/federated-mfa.ts");
    expect(content).toContain("tests/unit/mfa-session-fence.test.ts");
    expect(content).toContain("Engine Decoupling and Access");
  });
});
