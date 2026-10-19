import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relPath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)), "utf8");

describe("docs consistency: email-token-lock-order test execution status", () => {
  const betaReport = read("docs/implementation/PHASE4_BETA_REPORT.md");
  const federatedMfa = read("docs/security/FEDERATED_MFA.md");

  it("never marks tests/integration/email-token-lock-order.test.ts as unexecuted or not executed", () => {
    // Neither document should claim email-token-lock-order.test.ts is unexecuted or not executed locally.
    expect(betaReport).not.toMatch(/email-token-lock-order(?:\.test\.ts)?[^.\n]*?(?:not executed|unexecuted)/i);
    expect(federatedMfa).not.toMatch(/email-token-lock-order(?:\.test\.ts)?[^.\n]*?(?:not executed|unexecuted)/i);
  });

  it("consistently records email-token-lock-order.test.ts passed locally against PostgreSQL across docs", () => {
    // docs/security/FEDERATED_MFA.md records the 2026-10-08 local pass against PostgreSQL
    expect(federatedMfa).toMatch(
      /tests\/integration\/email-token-lock-order\.test\.ts[\s\S]*?All passed locally on 2026-10-08 against PostgreSQL/
    );

    // docs/implementation/PHASE4_BETA_REPORT.md H3 security readiness review records it passed locally on 2026-10-08
    // Anchored specifically to the "## H3 security readiness review" section and "two-connection PostgreSQL test" phrase
    const h3Section =
      betaReport.split("## H3 security readiness review")[1]?.split(/^## /m)[0] ?? "";
    expect(h3Section).toMatch(
      /two-connection PostgreSQL test `tests\/integration\/email-token-lock-order\.test\.ts` passed locally on 2026-10-08 against PostgreSQL/
    );

    // docs/implementation/PHASE4_BETA_REPORT.md #108 section records local verification against flowline_test_i108 and 2026-10-08 pass
    const i108Section =
      betaReport.split("## Account deletion vs the user's own SSO sign-in: lock-order test")[1]?.split(/^## /m)[0] ?? "";
    expect(i108Section).toMatch(
      /Verified locally against a throwaway `flowline_test_i108` database:[^\n]*?email-token-lock-order\.test\.ts/
    );
    expect(i108Section).toMatch(
      /The `tests\/integration\/email-token-lock-order\.test\.ts` suite also passed locally on 2026-10-08 against PostgreSQL/
    );

    // docs/implementation/PHASE4_BETA_REPORT.md #109 section records local verification against flowline_test_109
    const i109Section =
      betaReport.split("## Account deletion: audit rows before the workspace lock")[1]?.split(/^## /m)[0] ?? "";
    expect(i109Section).toMatch(
      /flowline_test_109` database \(PostgreSQL\):[^\n]*?`email-token-lock-order\.test\.ts` \(3\/3\)/
    );
  });
});
