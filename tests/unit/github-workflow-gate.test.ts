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

  it("lists the three PR numbers that require gate verification", () => {
    for (const pr of ["#360", "#330", "#308"]) {
      expect(workflow).toContain(pr);
    }
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
  });

  it("documents the full-tier verification command", () => {
    expect(workflow).toContain("Full-tier verification");
    expect(workflow).toContain("tier=full");
  });

  it("states what to do when gate is red", () => {
    expect(workflow).toMatch(/If any.*gate.*check is red.*do \*\*not\*\* merge/i);
  });

  it("references the three PRs that require gate verification in the verification section", () => {
    // The PRs should be mentioned in the context of gate verification
    expect(workflow).toContain("#360");
    expect(workflow).toContain("#330");
    expect(workflow).toContain("#308");
    // They should appear in the verification section (after the commands)
    const verificationSection = workflow.split("### Verifying the `gate` check")[1];
    expect(verificationSection).toContain("#360");
    expect(verificationSection).toContain("#330");
    expect(verificationSection).toContain("#308");
  });

  it("references AC1 in the section heading or nearby", () => {
    expect(workflow).toContain("AC1");
  });
});