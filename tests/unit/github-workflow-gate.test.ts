import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

// Issue #460: GITHUB_WORKFLOW.md must contain explicit gate verification procedures
// for PRs #360, #330, #308. This test pins the exact commands and PR numbers.
describe("GITHUB_WORKFLOW.md gate verification procedures (issue #460)", () => {
  const workflow = read("docs/GITHUB_WORKFLOW.md");

  it("contains a 'Verifying the gate check' section", () => {
    expect(workflow).toContain("### Verifying the `gate` check");
  });

  it("documents the quick status command (gh pr checks --required)", () => {
    expect(workflow).toContain("gh pr checks <PR_NUMBER> --required");
  });

  it("documents the detailed rollup command (gh pr view --json statusCheckRollup)", () => {
    expect(workflow).toContain("gh pr view <PR_NUMBER> --json statusCheckRollup");
    expect(workflow).toContain("statusCheckRollup");
    expect(workflow).toContain("conclusion");
  });

  it("documents the Actions run lookup command (gh run list --workflow gate.yml)", () => {
    expect(workflow).toContain("gh run list --workflow gate.yml");
    expect(workflow).toContain("--branch <BRANCH_NAME>");
    // The lookup must output headSha so the reader can match the run to the PR head.
    expect(workflow).toContain("--limit 5 --json databaseId,conclusion,headBranch,headSha,createdAt,url");
  });

  it("documents the full-tier verification command", () => {
    expect(workflow).toContain("Full-tier verification");
    expect(workflow).toContain("tier=full");
    expect(workflow).toContain("--event workflow_dispatch");
    expect(workflow).toContain("headSha");
    expect(workflow).not.toContain("displayTitle");
    expect(workflow).toContain("gh run view <RUN_ID> --json headSha,event,conclusion,url,jobs");
    expect(workflow).toContain("firefox");
    expect(workflow).toContain("webkit");
    expect(workflow).toContain("Do not treat empty output as success");
  });

  it("states what to do when gate is red", () => {
    expect(workflow).toMatch(/If any.*gate.*check is red.*do \*\*not\*\* merge/i);
  });

  it("checks the workflow assumptions used by full-tier verification", () => {
    const gate = read(".github/workflows/gate.yml");
    for (const job of ["firefox", "webkit"]) {
      // Scope the match to this job's block (up to the next two-space-indented job key).
      const block = gate.match(new RegExp(`\\n  ${job}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z0-9_-]+:\\n|$)`))?.[1];
      expect(block, `${job} job in gate.yml`).toBeDefined();
      expect(block).toContain("inputs.tier == 'full'");
    }
    expect(workflow).toContain("headRefOid");
  });
});
