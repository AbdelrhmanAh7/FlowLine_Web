import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relPath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), "utf8");

describe("@issue-315 docs and comment consistency: account deletion lock-order attribution", () => {
  const betaReport = read("docs/implementation/PHASE4_BETA_REPORT.md");
  const federatedMfa = read("docs/security/FEDERATED_MFA.md");
  const testFile = read("tests/integration/account-delete-sso-lock-order.test.ts");
  const evidenceFile = read("docs/evidence/315/EVIDENCE.md");

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

    // Reconciliation note asserts status agreement rather than "exact wording"
    expect(section).toMatch(/agrees on the status/i);
    expect(section).not.toMatch(/exact wording/i);
  });

  it("docs/security/FEDERATED_MFA.md consistently states federated-lock-order.test.ts ran locally in both Lock order and Validation limits", () => {
    const lockOrderMatch = federatedMfa.match(
      /## Lock order[\s\S]*?(?=\n## [^#]|$)/
    );
    expect(lockOrderMatch).not.toBeNull();
    const lockOrder = lockOrderMatch![0];
    expect(lockOrder).toMatch(
      /`tests\/integration\/federated-lock-order\.test\.ts`[\s\S]*?The test ran locally on 2026-10-12 against a throwaway PostgreSQL database for #108, and CI is the gate\./
    );
    expect(lockOrder).not.toMatch(
      /federated-lock-order\.test\.ts[\s\S]*?not executed locally/i
    );

    const validationLimitsMatch = federatedMfa.match(
      /## Validation limits[\s\S]*?(?=\n## [^#]|$)/
    );
    expect(validationLimitsMatch).not.toBeNull();
    const validationLimits = validationLimitsMatch![0];
    expect(validationLimits).toContain(
      "`tests/integration/federated-lock-order.test.ts` ran locally on 2026-10-12 against a throwaway PostgreSQL database for #108, and CI is the gate"
    );
  });

  it("account-delete-sso-lock-order.test.ts header consistently attributes deadlock removal, naming, and expected failure", () => {
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

    // Uses expected failure phrasing against old deletion order
    expect(testFile).toMatch(
      /Against the old deletion order the SSO-first case is expected to fail: deletion\s*\/\/\s*would wait at `delete from "user"` holding W, and on release the SSO audit insert would deadlock with it \(40P01\)\./
    );
  });

  it("docs/evidence/315/EVIDENCE.md tracks AC5 linking the CTO decision", () => {
    expect(evidenceFile).toContain("AC5");
    expect(evidenceFile).toContain("https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/214#issuecomment-6121061574");
    expect(evidenceFile).toContain("b9ae3ee");
  });
});
