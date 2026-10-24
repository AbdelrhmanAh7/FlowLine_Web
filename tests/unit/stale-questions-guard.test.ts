import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

/**
 * Checks text for stale blockers or unmerged branch dependency notes regarding #196 / #197 / #179.
 */
export function findStaleQuestionViolations(content: string): string[] {
  const violations: string[] = [];

  const stalePatterns: { regex: RegExp; description: string }[] = [
    {
      regex: /blocked:?\s+prerequisite\s+#196/i,
      description: "Stale blocker reference to prerequisite #196",
    },
    {
      regex: /blocked\s+on\s+#196/i,
      description: "Reference to being blocked on #196",
    },
    {
      regex: /branch\s+(#?196|ai\/196)\s+is\s+not\s+merged/i,
      description: "Reference to branch 196 not being merged",
    },
    {
      regex: /need\s+for\s+merging\s+#196\s+into\s+[`']?main[`']?/i,
      description: "Requirement statement about merging #196 before #197",
    },
    {
      regex: /conflicts\s+with\s+#197/i,
      description: "Claim of conflicting changes with #197",
    },
    {
      regex: /(?:until\s+then[^\n]*#179|blocked[^\n]*#179)/i,
      description: "Stale reference to merged issue #179 in questions",
    },
  ];

  for (const { regex, description } of stalePatterns) {
    if (regex.test(content)) {
      violations.push(description);
    }
  }

  return violations;
}

describe("@issue-300 guard against stale #196 blocker notes and #179 references in AI_QUESTIONS.md (supersedes part of #268)", () => {
  it("rejects historical QA finding: stale reference to prerequisite #196 being blocked", () => {
    const historicalOffendingText = [
      "# Questions for #197 (account security page 2/4)",
      "",
      "## Blocked: prerequisite #196 (part 1/4) is not on `main`",
      "The brief says #197 edits `src/app/account/security/page.tsx`, which #196 creates, and that #196 must be merged first.",
    ].join("\n");

    const violations = findStaleQuestionViolations(historicalOffendingText);
    expect(violations).toContain("Stale blocker reference to prerequisite #196");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects historical QA finding: branch 196 not merged and conflicting with #197", () => {
    const historicalOffendingText = [
      "Still blocked. `ai/196` still has only f59477d committed; its worktree holds the page, spec, menu link and i18n keys as uncommitted changes from a running agent.",
      "The branch 196 is not merged, and its changes (page, spec, menu link, i18n keys) are still uncommitted. This creates a dependency that conflicts with #197's intended changes.",
    ].join("\n");

    const violations = findStaleQuestionViolations(historicalOffendingText);
    expect(violations).toContain("Reference to branch 196 not being merged");
    expect(violations).toContain("Claim of conflicting changes with #197");
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects binding board finding: stale reference to #179 in AI_QUESTIONS.md", () => {
    const historical179Text =
      "Until then, #166 keeps the repo at 8 by merging the two same-route platform-admin API tests (#179 into `e2e-army/200-route-error-headers.e2e.ts`); every test and tag is kept. See that file's header.";
    const violations = findStaleQuestionViolations(historical179Text);
    expect(violations).toContain("Stale reference to merged issue #179 in questions");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("rejects the full unmerged AI_QUESTIONS.md text that blocked PR #268", () => {
    const fullHistoricalText = `
# Questions for #197 (account security page 2/4)

## Blocked: prerequisite #196 (part 1/4) is not on \`main\`

The brief says #197 edits \`src/app/account/security/page.tsx\`, which #196 creates, and that #196 must be merged first.

Checked on 2026-10-13 from \`ai/197\` (based on \`main\` at 9c754b2):
- \`src/app/account/\` has no \`security/\` directory; \`e2e/account-security.spec.ts\` does not exist either.
- Branch \`ai/196\` holds only the e2e-army test and a \`docs/DEVELOPER_GUIDE.md\` change (f59477d). It has no page, menu link or spec yet. The team plan lists #196 as RUNNING.

I did not re-create the page, the status badge or \`e2e/account-security.spec.ts\` here. That would duplicate #196's scope and conflict when both merge. I also did not write the e2e-army test, since there is no page to run it against.

## What is needed to continue
1. Merge #196 into \`main\`.
2. Rebase \`ai/197\` on \`main\` (or re-dispatch #197).
3. Run #197 as written: new \`two-factor-card.tsx\`, \`page.tsx\` edit, \`ar.json\`/\`en.json\` keys under \`account.security.twoFactor.*\`, the new case in \`e2e/account-security.spec.ts\`, the e2e-army test, and one bullet in \`docs/implementation/BETA_USER_GUIDE.md\`.

If you want #197 to proceed before #196 merges, say which branch to stack it on (\`ai/196\` once it has the page).

## Re-check (2026-10-13, second dispatch)

Still blocked. \`ai/196\` still has only f59477d committed; its worktree (\`impl/FlowLine_Web-196\`) holds the page, spec, menu link and i18n keys as uncommitted changes from a running agent. Stacking #197 on that unfinished state would conflict with #196's files (\`page.tsx\`, \`e2e/account-security.spec.ts\`, \`en.json\`/\`ar.json\`, \`BETA_USER_GUIDE.md\`). Re-dispatch #197 once #196 is committed and merged.
`;

    const violations = findStaleQuestionViolations(fullHistoricalText);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("verifies that repository AI_QUESTIONS.md contains no stale #196 or #179 claims, or is absent", () => {
    const questionsPath = resolve(root, "AI_QUESTIONS.md");
    if (existsSync(questionsPath)) {
      const content = readFileSync(questionsPath, "utf8");
      const violations = findStaleQuestionViolations(content);
      expect(violations).toEqual([]);
      expect(content).not.toMatch(/\b(196|179)\b/);
    } else {
      expect(existsSync(questionsPath)).toBe(false);
    }
  });

  it("explicitly verifies that AI_QUESTIONS.md is removed on head to eliminate stale blocker notes", () => {
    const questionsPath = resolve(root, "AI_QUESTIONS.md");
    expect(existsSync(questionsPath)).toBe(false);
  });

  it("verifies that active documentation files contain no stale references claiming #196 blocks progress", () => {
    const docsToCheck = [
      "NEXT_ACTION.md",
      "docs/implementation/PROGRESS.md",
      "docs/implementation/PHASE4_BETA_REPORT.md",
    ];

    for (const relPath of docsToCheck) {
      const fullPath = resolve(root, relPath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf8");
        const violations = findStaleQuestionViolations(content);
        expect(violations, `Stale #196 blocker in ${relPath}`).toEqual([]);
      }
    }
  });

  it("handles case-insensitivity and formatting variations for stale blocker patterns", () => {
    const variations = [
      "BLOCKED ON #196",
      "Blocked: Prerequisite #196 is missing",
      "Branch ai/196 is not merged into main",
      "need for merging #196 into 'main'",
      "This change conflicts with #197 and is blocked",
      "Until then, see #179 for details",
    ];

    for (const variation of variations) {
      const violations = findStaleQuestionViolations(variation);
      expect(violations.length, `Expected violation for "${variation}"`).toBeGreaterThan(0);
    }
  });
});
