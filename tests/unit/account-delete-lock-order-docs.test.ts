import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relPath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), "utf8");

describe("@issue-315 docs and comment consistency: account deletion lock-order attribution", () => {
  const betaReport = read("docs/implementation/PHASE4_BETA_REPORT.md");
  const testFile = read("tests/integration/account-delete-sso-lock-order.test.ts");

  it("PHASE4_BETA_REPORT.md contains the #108 section with a preceding blank line (MD022)", () => {
    // Heading exists
    expect(betaReport).toContain("## Account deletion vs the user's own SSO sign-in: lock-order test — 2026-10-12 (issue #108, part 1 of #47)");
    // Preceded by a blank line
    expect(betaReport).toMatch(/\n\n## Account deletion vs the user's own SSO sign-in: lock-order test/);
  });

  it("PHASE4_BETA_REPORT.md consistently credits deadlock removal to issue #45 (PR #65) and #109 to audit reordering", () => {
    const sectionMatch = betaReport.match(
      /## Account deletion vs the user's own SSO sign-in: lock-order test[\s\S]*?(?=\n## |$)/
    );
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];

    // Explicitly attributes the deadlock removal to issue #45 (PR #65)
    expect(section).toMatch(
      /removed the deadlock between account deletion.*and SSO.*issue #45 \(PR #65\)/i
    );

    // States what #109 (PR #216) actually did: audit-before-workspace reordering
    expect(section).toMatch(
      /issue #109 \(PR #216\) implemented the subsequent audit-before-workspace reordering/i
    );

    // Consistently names the hazard pre-#65
    expect(section).toMatch(/pre-#65/);
    expect(section).not.toMatch(/pre-#109/);
  });

  it("account-delete-sso-lock-order.test.ts header consistently attributes deadlock removal and naming", () => {
    // Attributes deadlock removal to issue #45 (PR #65)
    expect(testFile).toMatch(
      /Issue #45 \(PR #65\) removed the deadlock by locking the user row before the workspaces/
    );

    // Identifies #109 / PR #216 as audit-before-workspace reordering
    expect(testFile).toMatch(
      /PR #216 \(#109\) subsequently implemented the audit-before-workspace reordering/
    );

    // Identifies the hazard as pre-#65
    expect(testFile).toMatch(/The pre-#65 deadlock hazard it guards against/);
    expect(testFile).not.toMatch(/The pre-#109 deadlock hazard/);
  });
});
