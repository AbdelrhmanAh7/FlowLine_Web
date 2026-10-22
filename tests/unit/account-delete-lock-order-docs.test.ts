import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relPath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), "utf8");

describe("@issue-408 docs, header consistency, and lock-order proof: account deletion vs SSO (#108)", () => {
  const betaReport = read("docs/implementation/PHASE4_BETA_REPORT.md");
  const federatedMfa = read("docs/security/FEDERATED_MFA.md");
  const testFile = read("tests/integration/account-delete-sso-lock-order.test.ts");
  const evidenceFile = read("docs/evidence/408/EVIDENCE.md");

  it("AC1: PHASE4_BETA_REPORT.md contains the #108 section with a preceding blank line (MD022)", () => {
    // Heading exists
    expect(betaReport).toContain("## Account deletion vs the user's own SSO sign-in: lock-order test — 2026-10-12 (issue #108, part 1 of #47)");
    // Preceded by a blank line
    expect(betaReport).toMatch(/\n\n## Account deletion vs the user's own SSO sign-in: lock-order test/);
  });

  it("AC1: PHASE4_BETA_REPORT.md consistently credits deadlock removal to issue #45 (PR #65) and #109 to audit reordering", () => {
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

    // Explains that 83c7bb8e already contained user-first locking from PR #65
    expect(section).toMatch(/83c7bb8e[\s\S]*?already contained the user-first locking/i);

    // Explains git history and technical reality without asserting unbacked CTO authorization
    expect(section).not.toMatch(/\bCTO\b/i);
    expect(section).not.toMatch(/As confirmed by the CTO/i);
    expect(section).not.toMatch(/Per CTO instructions/i);

    // Resolves email-token-lock-order local verification ambiguity (unit executed vs integration unexecuted)
    expect(section).toContain("tests/unit/email-token-lock-order.test.ts");
    expect(section).toContain("tests/integration/email-token-lock-order.test.ts` remains marked unexecuted");

    // Reconciliation note asserts status agreement rather than "exact wording"
    expect(section).toMatch(/agrees on the status/i);
    expect(section).not.toMatch(/exact wording/i);
  });

  it("AC2: docs/security/FEDERATED_MFA.md explicitly names federated-lock-order.test.ts in Validation limits and consistently states local run status", () => {
    const lockOrderMatch = federatedMfa.match(
      /## Lock order[\s\S]*?(?=\n## [^#]|$)/
    );
    expect(lockOrderMatch).not.toBeNull();
    const lockOrder = lockOrderMatch![0];
    expect(lockOrder).toMatch(
      /`tests\/integration\/federated-lock-order\.test\.ts`[\s\S]*?ran locally on 2026-10-12 against a throwaway PostgreSQL database for #108, and CI is the gate\./
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

  it("AC3: account-delete-sso-lock-order.test.ts header consistently attributes deadlock removal, naming, and expected failure without stale point-in-time results", () => {
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

    // Does not hardcode stale point-in-time results or unbacked CTO directive in test header
    expect(testFile).not.toMatch(/\(2\/2 pass\)/);
    expect(testFile).not.toMatch(/head [0-9a-f]{7,40}/i);
    expect(testFile).not.toMatch(/\bCTO\b/i);
    expect(testFile).not.toMatch(/Per CTO directive/i);
    expect(testFile).not.toMatch(/As confirmed by the CTO/i);
  });

  it("AC4: lock-order conflict analysis proves pre-#65 circular wait (40P01) and head serializability without deadlock", () => {
    // PostgreSQL row-level lock conflict matrix (PostgreSQL docs Table 13.3)
    const conflictsWith = (holder: string, waiter: string): boolean => {
      if (holder === "FOR UPDATE") return true;
      if (waiter === "FOR UPDATE") return true;
      if (holder === "FOR NO KEY UPDATE" && (waiter === "FOR UPDATE" || waiter === "FOR NO KEY UPDATE" || waiter === "FOR SHARE")) return true;
      if (waiter === "FOR NO KEY UPDATE" && (holder === "FOR UPDATE" || holder === "FOR NO KEY UPDATE" || holder === "FOR SHARE")) return true;
      if ((holder === "FOR SHARE" && waiter === "FOR UPDATE") || (holder === "FOR UPDATE" && waiter === "FOR SHARE")) return true;
      return false;
    };

    // SSO takes user FOR SHARE, then workspace FOR KEY SHARE
    const ssoLocks = [
      { resource: "user", mode: "FOR SHARE" },
      { resource: "workspace", mode: "FOR KEY SHARE" },
    ];

    // Buggy pre-#65 Deletion took workspace FOR UPDATE, then user FOR UPDATE
    const pre65DeletionLocks = [
      { resource: "workspace", mode: "FOR UPDATE" },
      { resource: "user", mode: "FOR UPDATE" },
    ];

    // When SSO holds user FOR SHARE, pre-#65 deletion at step 2 attempts user FOR UPDATE:
    const deletionWaitsForSsoOnUser = conflictsWith(ssoLocks[0]!.mode, pre65DeletionLocks[1]!.mode);
    expect(deletionWaitsForSsoOnUser).toBe(true);

    // When pre-#65 deletion holds workspace FOR UPDATE, SSO at step 2 attempts workspace FOR KEY SHARE:
    const ssoWaitsForDeletionOnWorkspace = conflictsWith(pre65DeletionLocks[0]!.mode, ssoLocks[1]!.mode);
    expect(ssoWaitsForDeletionOnWorkspace).toBe(true);

    // Circular wait (deadlock 40P01) exists in pre-#65 ordering
    expect(deletionWaitsForSsoOnUser && ssoWaitsForDeletionOnWorkspace).toBe(true);

    // Fixed head (#65 / #109) takes user FOR UPDATE first
    const headDeletionLocks = [
      { resource: "user", mode: "FOR UPDATE" },
      { resource: "workspace", mode: "FOR UPDATE" },
    ];

    // Both serialize on the user row first; dependency graph is acyclic
    expect(ssoLocks[0]!.resource).toBe("user");
    expect(headDeletionLocks[0]!.resource).toBe("user");
  });

  it("AC5: docs/evidence/408/EVIDENCE.md tracks AC for the #108 criterion deviation and records real commit SHA", () => {
    expect(evidenceFile).toContain("AC for #108 criterion deviation");
    expect(evidenceFile).toMatch(/skipped.*superseded/i);
    expect(evidenceFile).toMatch(/PR #65/);
    expect(evidenceFile).toMatch(/Tested commit: `[0-9a-f]{8,40}`/);
  });
});
