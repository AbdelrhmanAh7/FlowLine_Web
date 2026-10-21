import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

export function analyzeFlowInvarianceAssertion(code: string): string[] {
  const violations: string[] = [];

  // Check if test makes claims about flow list not changing / flow not created
  const claimsNoChange =
    /flow list did not change/i.test(code) ||
    /no flow (?:is|was) created/i.test(code) ||
    /remains? unchanged/i.test(code);

  if (!claimsNoChange) {
    return violations;
  }

  // Blocker Check 1: Must capture pre-action flow snapshot (count or IDs before)
  const capturesBefore =
    /before(?:Rows|Ids|Flows|Count|List)/i.test(code) ||
    /(?:initial|before).*\/flows/i.test(code);
  if (!capturesBefore) {
    violations.push(
      "MISSING_PRE_ACTION_SNAPSHOT: Flow list invariance assertion lacks pre-action flow snapshot (flow count or IDs not captured before attempt)",
    );
  }

  // Blocker Check 2: Must compare post-action state against pre-action state
  const comparesAfterAgainstBefore =
    /expect\([^)]*after[^)]*\)\.(?:toEqual|toHaveLength)\([^)]*before/i.test(code) ||
    /expect\([^)]*after.*Ids[^)]*\)\.toEqual\([^)]*before.*Ids/i.test(code);
  if (!comparesAfterAgainstBefore) {
    violations.push(
      "MISSING_POST_ACTION_COMPARISON: Flow list invariance assertion does not compare post-action flow list (count/IDs) against pre-action state",
    );
  }

  // Blocker Check 3: Cannot rely solely on alert visibility without state comparison
  const checksAlertOnly =
    /getByRole\((['"`])alert\1\)/i.test(code) && !comparesAfterAgainstBefore;
  if (checksAlertOnly) {
    violations.push(
      "ALERT_ONLY_ASSERTION: Test relies solely on alert visibility to claim no flow was created, leaving flows created despite error undetected",
    );
  }

  return violations;
}

export const HISTORICAL_PR362_AC2_SNIPPET = `test(
  "@issue-295 AC2: pasting text that is not JSON is refused and no flow is created",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("paste {text} into the n8n workflow box and click Import", { params: { text: "{ not json" } });
    await agent.assert("an error says the file is not a valid n8n workflow and the flow list did not change");
    await expect(screen.getByRole("alert").first()).toBeVisible();
  },
);`;

describe("@issue-375 guard against unverified flow list invariance (supersedes part of #362)", () => {
  it("AC2: flags blocker violations on historical PR #362 AC2 snippet (regression negative control)", () => {
    const violations = analyzeFlowInvarianceAssertion(HISTORICAL_PR362_AC2_SNIPPET);
    expect(violations).toContain(
      "MISSING_PRE_ACTION_SNAPSHOT: Flow list invariance assertion lacks pre-action flow snapshot (flow count or IDs not captured before attempt)",
    );
    expect(violations).toContain(
      "MISSING_POST_ACTION_COMPARISON: Flow list invariance assertion does not compare post-action flow list (count/IDs) against pre-action state",
    );
    expect(violations).toContain(
      "ALERT_ONLY_ASSERTION: Test relies solely on alert visibility to claim no flow was created, leaving flows created despite error undetected",
    );
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it("AC1: verifies e2e-army/117-flows-list-dashboard.e2e.ts @issue-375 AC1 captures before/after snapshot and compares IDs", () => {
    const filePath = resolve(root, "e2e-army/117-flows-list-dashboard.e2e.ts");
    const content = readFileSync(filePath, "utf8");

    // Must contain issue 375 test
    expect(content).toContain("@issue-375 AC1");

    // Extract the issue 375 test block
    const testMatch = content.match(/test\(\s*["']@issue-375 AC1[\s\S]*?\n\);/);
    expect(testMatch, "Must find @issue-375 AC1 test block in 117-flows-list-dashboard.e2e.ts").not.toBeNull();

    const snippet = testMatch![0];
    const violations = analyzeFlowInvarianceAssertion(snippet);
    expect(violations).toEqual([]);

    // Explicitly verify critical assertions exist in test code
    expect(snippet).toMatch(/beforeRows\s*=\s*\(\(await http\.get\(/);
    expect(snippet).toMatch(/beforeIds\s*=\s*beforeRows\.map/);
    expect(snippet).toMatch(/expect\(afterInvalidTemplateRows\)\.toHaveLength\(beforeRows\.length\)/);
    expect(snippet).toMatch(/expect\(afterInvalidTemplateIds\)\.toEqual\(beforeIds\)/);
    expect(snippet).toMatch(/expect\(afterInvalidBodyRows\)\.toHaveLength\(beforeRows\.length\)/);
    expect(snippet).toMatch(/expect\(afterInvalidBodyIds\)\.toEqual\(beforeIds\)/);
  });

  it("AC3: verifies all active e2e-army tests satisfy flow invariance criteria", () => {
    const e2eArmyDir = resolve(root, "e2e-army");
    const topFiles = readdirSync(e2eArmyDir).filter((file) => file.endsWith(".e2e.ts"));

    for (const file of topFiles) {
      const content = readFileSync(resolve(e2eArmyDir, file), "utf8");
      // If a test mentions flow list invariance, it must satisfy the guard
      if (/flow list did not change/i.test(content)) {
        const violations = analyzeFlowInvarianceAssertion(content);
        expect(violations, `e2e-army/${file} has unverified flow list invariance assertion`).toEqual([]);
      }
    }
  });

  it("AC4: verifies total top-level e2e-army test files respects the hub cap (<= 8 files)", () => {
    const e2eArmyDir = resolve(root, "e2e-army");
    const topFiles = readdirSync(e2eArmyDir).filter((file) => /^[\w.-]+\.e2e\.ts$/.test(file));
    expect(topFiles.length).toBeLessThanOrEqual(8);
  });
});
