import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

export function findSignupVerifyViolations(content: string): string[] {
  const violations: string[] = [];
  const rules = [
    {
      regex: /process\.env\.(?:FLOWLINE_ENV|FLOWLINE_TEST_AUTO_VERIFY)\s*=/i,
      description: "Mutating server environment flags inside browser/test runner process",
    },
    {
      regex: /['"`]test@example\.com['"`]/i,
      description: "Hardcoded non-unique email address test@example.com prone to rerun collisions",
    },
    {
      regex: /\/api\/users\//i,
      description: "Calling non-existent /api/users endpoint for user verification state",
    },
    {
      regex: /['"`]\/en\/signup['"`]/i,
      description: "Calling non-canonical route /en/signup (canonical is /sign-up or /en/sign-up)",
    },
    {
      regex: /expect\([^)]*emails[^)]*\)\.toHaveLength\(0\)/i,
      description: "Asserting empty outbox with toHaveLength(0) vulnerable to shared outbox pollution",
    },
  ];

  for (const { regex, description } of rules) {
    if (regex.test(content)) {
      violations.push(description);
    }
  }

  return violations;
}

const HISTORICAL_OFFENDING_SOURCE = `import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-124 AC1: TestSprite sign-up auto-verify in staging", { tags: ["feat:auth-signup"] }, async ({ app, agent, screen }) => {
  // Set staging environment and auto-verify flag
  process.env.FLOWLINE_ENV = 'test';
  process.env.FLOWLINE_TEST_AUTO_VERIFY = '1';

  // Navigate to sign-up page
  await app.open('/en/signup');

  // Fill sign-up form
  await agent.act("fill sign-up form with {email} and {password}", {
    params: { email: "test@example.com", password: "password123" }
  });

  // Submit sign-up
  await agent.act("submit sign-up form");

  // Verify immediate sign-in
  await expect(screen.getByText("Welcome, test@example.com!")).toBeVisible();

  // Check email was not sent (since auto-verify is enabled)
  const emails = await app.request('/api/test/outbox');
  expect(emails).toHaveLength(0);

  // Verify user is marked as verified
  const user = await app.request('/api/users/test@example.com');
  expect(user.verified).toBe(true);
});
`;

describe("@issue-337 guard against unpassable duplicate e2e-army/124-signup-verify.e2e.ts (supersedes part of #135, refs #124)", () => {
  it("AC1 & AC5: flags all 5 unpassable anti-patterns on historical PR #135 test code (regression negative control)", () => {
    const violations = findSignupVerifyViolations(HISTORICAL_OFFENDING_SOURCE);
    expect(violations).toContain("Mutating server environment flags inside browser/test runner process");
    expect(violations).toContain("Hardcoded non-unique email address test@example.com prone to rerun collisions");
    expect(violations).toContain("Calling non-existent /api/users endpoint for user verification state");
    expect(violations).toContain("Calling non-canonical route /en/signup (canonical is /sign-up or /en/sign-up)");
    expect(violations).toContain("Asserting empty outbox with toHaveLength(0) vulnerable to shared outbox pollution");
    expect(violations).toHaveLength(5);
  });

  it("AC2: verifies e2e-army/124-signup-verify.e2e.ts is deleted and absent from repo tree", () => {
    const filePath = resolve(root, "e2e-army/124-signup-verify.e2e.ts");
    expect(existsSync(filePath), "e2e-army/124-signup-verify.e2e.ts must not exist").toBe(false);
  });

  it("AC3: verifies active e2e-army suite contains no unpassable environment-mutation or non-existent endpoint anti-patterns", () => {
    const e2eArmyDir = resolve(root, "e2e-army");
    const topFiles = readdirSync(e2eArmyDir).filter((file) => file.endsWith(".e2e.ts"));

    for (const file of topFiles) {
      const content = readFileSync(resolve(e2eArmyDir, file), "utf8");
      const violations = findSignupVerifyViolations(content);
      expect(violations, `e2e-army/${file} should contain no signup-verify anti-pattern violations`).toEqual([]);
    }
  });

  it("AC4: verifies total top-level e2e-army test files respects the hub cap (<= 8 files)", () => {
    const e2eArmyDir = resolve(root, "e2e-army");
    const topFiles = readdirSync(e2eArmyDir).filter((file) => /^[\w.-]+\.e2e\.ts$/.test(file));
    expect(topFiles.length).toBeLessThanOrEqual(8);
  });
});
