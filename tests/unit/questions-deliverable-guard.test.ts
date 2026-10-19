import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

export function findDeliverableViolationsInQuestions(content: string): string[] {
  const violations: string[] = [];
  const deliverablePatterns = [
    { regex: /^#\s+Issue\s+#?\d+:\s*Review\s+of\s+merged\s+CI\s+PRs/im, description: "Stray issue audit deliverable header in questions file" },
    { regex: /###\s*QA\s+Checklist\s+Results/i, description: "Stray QA checklist results section in questions file" },
    { regex: /\|\s*Item\s*\|\s*Status\s*\|\s*Details\s*\|/i, description: "Stray checklist results table in questions file" },
    { regex: /\|\s*Actions\s+pinned\s+by\s+commit\s+SHA\s*\|\s*.*PASS/i, description: "Stray checklist audit evaluation row in questions file" },
    { regex: /^##\s+PR\s+#\d+:.*?\n\s*\*\*Status:\*\*\s*[✅PASS]/im, description: "Stray merged PR audit review section in questions file" },
  ];

  for (const { regex, description } of deliverablePatterns) {
    if (regex.test(content)) violations.push(description);
  }
  return violations;
}

const HISTORICAL_OFFENDING_TEXT = [
  "# Issue #250: Review of merged CI PRs against QA checklist",
  "## PR #81: ci(gate): run product CI on GitHub runners — Merge commit d211653",
  "**Status:** ✅ PASS on all checklist items",
  "### QA Checklist Results",
  "| Item | Status | Details |",
  "| Actions pinned by commit SHA | ✅ PASS | gate.yml: actions/checkout@3d3c42e5 (v7.0.1) |",
  "| ubuntu-24.04 runners | ✅ PASS | All jobs use ubuntu-24.04 |",
].join("\n");

describe("@issue-297 guard against stray audit deliverables in AI_QUESTIONS.md (supersedes part of #271)", () => {
  it("rejects historical QA finding: Issue #250 audit deliverable incorrectly placed in AI_QUESTIONS.md", () => {
    const violations = findDeliverableViolationsInQuestions(HISTORICAL_OFFENDING_TEXT);
    expect(violations).toContain("Stray issue audit deliverable header in questions file");
    expect(violations).toContain("Stray QA checklist results section in questions file");
    expect(violations).toContain("Stray checklist results table in questions file");
    expect(violations).toContain("Stray checklist audit evaluation row in questions file");
    expect(violations).toContain("Stray merged PR audit review section in questions file");
    expect(violations.length).toBe(5);
  });

  it("verifies that repository AI_QUESTIONS.md contains no stray audit deliverables on current head", () => {
    const questionsPath = resolve(root, "AI_QUESTIONS.md");
    if (existsSync(questionsPath)) {
      const content = readFileSync(questionsPath, "utf8");
      expect(findDeliverableViolationsInQuestions(content)).toEqual([]);
      expect(content).not.toMatch(/#\s+Issue\s+#?250/i);
      expect(content).not.toMatch(/QA Checklist Results/i);
    }
  });

  it("verifies that QA checklist audit deliverable is preserved in docs/ rather than AI_QUESTIONS.md", () => {
    const auditDocPath = resolve(root, "docs/evidence/250/qa-checklist-audit.md");
    expect(existsSync(auditDocPath), "docs/evidence/250/qa-checklist-audit.md should exist").toBe(true);
    const docContent = readFileSync(auditDocPath, "utf8");
    expect(docContent).toMatch(/# QA Checklist Audit Report: PRs #81, #83, #87 \(Issue #250\)/);
    expect(docContent).toMatch(/PR #81/);
    expect(docContent).toMatch(/PR #83/);
    expect(docContent).toMatch(/PR #87/);
  });

  it("verifies that active documentation files contain no stray audit checklist tables", () => {
    for (const relPath of ["NEXT_ACTION.md", "docs/implementation/PROGRESS.md"]) {
      const fullPath = resolve(root, relPath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf8");
        expect(findDeliverableViolationsInQuestions(content), `Stray deliverable in ${relPath}`).toEqual([]);
      }
    }
  });
});
