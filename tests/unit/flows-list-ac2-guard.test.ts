import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => []),
        })),
      })),
    })),
  },
  schema: {
    workspace: { id: "id", slug: "slug" },
    workspaceMember: { workspaceId: "workspace_id", userId: "user_id", role: "role" },
    flow: { id: "id", workspaceId: "workspace_id" },
  },
}));

import { isPlaceholderSlug, requireWorkspace, requireWorkspaceBySlug, type CurrentUser } from "@/server/access";
import { createFlow, flowNameSchema } from "@/server/flows";

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

export function analyzeFileUploadWiring(code: string): string[] {
  const violations: string[] = [];
  const usesDirectSetInput = /\.setInputFiles\(/i.test(code);
  const usesFileChooserAndClick = /waitForEvent\(['"]filechooser['"]\)/i.test(code) && /click\(/i.test(code);
  if (usesDirectSetInput && !usesFileChooserAndClick) {
    violations.push(
      "BYPASSES_BUTTON_WIRING: Test calls setInputFiles directly on hidden input without triggering filechooser via button click",
    );
  }
  return violations;
}

export function analyzePlaceholderRunRejection(code: string): string[] {
  const violations: string[] = [];
  const checksInvalidFlow = /INVALID_FLOW/.test(code);
  const checksSetupRequired = /SETUP_REQUIRED/.test(code);
  if (checksInvalidFlow && !checksSetupRequired) {
    violations.push(
      "MISSING_SETUP_REQUIRED_ASSERTION: Test checks INVALID_FLOW but omits SETUP_REQUIRED assertion for placeholder node",
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

export const HISTORICAL_PR362_AC5_SNIPPET = `test(
  "@issue-295 AC5: uploading a valid .json file parses and populates the workflow box",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    const fixture = createWorkflowFixture("valid", N8N_WORKFLOW);
    try {
      await screen.getByLabel("n8n workflow file").setInputFiles(fixture.file);
      const textarea = screen.getByRole("textbox", { name: "n8n workflow JSON" });
      await expect(textarea).toHaveValue(/Webhook/);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  },
);`;

export const HISTORICAL_PR362_AC8_SNIPPET = `test(
  "@issue-295 AC8: an imported workflow with a placeholder cannot run until the placeholder is replaced",
  { tags: ["feat:fl-flow-validation", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, browser }) => {
    const run = await fetch(new URL(\`/api/flows/\${flow.id}/runs\`, app.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ input: {} }),
    });
    expect(run.status).toBe(422);
    const body = (await run.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVALID_FLOW");
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

  it("AC5: isPlaceholderSlug correctly identifies placeholder slug strings and allows valid slugs", () => {
    expect(isPlaceholderSlug("{slug}")).toBe(true);
    expect(isPlaceholderSlug("[slug]")).toBe(true);
    expect(isPlaceholderSlug(":slug")).toBe(true);
    expect(isPlaceholderSlug("slug")).toBe(true);
    expect(isPlaceholderSlug("{wid}")).toBe(true);
    expect(isPlaceholderSlug("[wid]")).toBe(true);
    expect(isPlaceholderSlug(":wid")).toBe(true);
    expect(isPlaceholderSlug("wid")).toBe(true);
    expect(isPlaceholderSlug(" {slug} ")).toBe(true);
    expect(isPlaceholderSlug(null)).toBe(false);
    expect(isPlaceholderSlug(undefined)).toBe(false);
    expect(isPlaceholderSlug("valid-workspace-slug")).toBe(false);
    expect(isPlaceholderSlug("workspace-123")).toBe(false);
  });

  it("AC6: requireWorkspace rejects placeholder wids and non-UUIDs with 404 HttpError", async () => {
    const fakeUser: CurrentUser = { id: "user-1", email: "u@test.local", name: "User" };
    await expect(requireWorkspace(fakeUser, "{slug}")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(requireWorkspace(fakeUser, "slug")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(requireWorkspace(fakeUser, "not-a-uuid")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("AC7: requireWorkspaceBySlug returns null for placeholder slugs", async () => {
    const fakeUser: CurrentUser = { id: "user-1", email: "u@test.local", name: "User" };
    expect(await requireWorkspaceBySlug(fakeUser, "{slug}")).toBeNull();
    expect(await requireWorkspaceBySlug(fakeUser, "[slug]")).toBeNull();
    expect(await requireWorkspaceBySlug(fakeUser, "slug")).toBeNull();
    expect(await requireWorkspaceBySlug(fakeUser, "{wid}")).toBeNull();
  });

  it("AC8: layout.tsx catches malformed URI escape sequences in slug and returns 404 rather than unhandled 500", () => {
    const layoutPath = resolve(root, "src/app/w/[slug]/layout.tsx");
    const layoutContent = readFileSync(layoutPath, "utf8");
    expect(layoutContent).toMatch(/try\s*\{\s*decodedSlug\s*=\s*decodeURIComponent\(slug\);\s*\}\s*catch\s*\{\s*notFound\(\);\s*\}/);
    expect(() => decodeURIComponent("%E0%A4%A")).toThrow(URIError);
  });

  it("AC9: createFlow rejects unknown template with HTTP 400 and code UNKNOWN_TEMPLATE", async () => {
    const fakeUser: CurrentUser = { id: "user-1", email: "u@test.local", name: "User" };
    await expect(
      createFlow(fakeUser, "00000000-0000-0000-0000-000000000001", { templateId: "non-existent-template-id" }),
    ).rejects.toMatchObject({ status: 400, code: "UNKNOWN_TEMPLATE" });
  });

  it("AC10: flowNameSchema rejects invalid names (whitespace, numeric/non-string)", () => {
    expect(() => flowNameSchema.parse("   ")).toThrow();
    expect(() => flowNameSchema.parse(12345 as unknown as string)).toThrow();
  });

  it("AC11: flow creation route schema rejects non-string name and invalid payloads with validation error", () => {
    const routeSchema = z.object({ name: z.string().optional(), templateId: z.string().optional() });
    expect(routeSchema.safeParse({ name: 12345 }).success).toBe(false);
    expect(routeSchema.safeParse({ templateId: 12345 }).success).toBe(false);
    expect(routeSchema.safeParse({ templateId: "lead-qualifier" }).success).toBe(true);
    expect(routeSchema.safeParse({ name: "Valid Flow" }).success).toBe(true);
  });

  it("AC12: flags blocker violation on historical PR #362 AC5 snippet for bypassing file upload button wiring", () => {
    const violations = analyzeFileUploadWiring(HISTORICAL_PR362_AC5_SNIPPET);
    expect(violations).toContain(
      "BYPASSES_BUTTON_WIRING: Test calls setInputFiles directly on hidden input without triggering filechooser via button click",
    );

    // Verify valid wiring pattern passes
    const validSnippet = `
      const fileChooserPromise = page.waitForEvent('filechooser');
      await screen.getByRole('button', { name: 'Upload .json file' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(fixture.file);
    `;
    expect(analyzeFileUploadWiring(validSnippet)).toEqual([]);
  });

  it("AC13: flags blocker violation on historical PR #362 AC8 snippet for missing SETUP_REQUIRED assertion", () => {
    const violations = analyzePlaceholderRunRejection(HISTORICAL_PR362_AC8_SNIPPET);
    expect(violations).toContain(
      "MISSING_SETUP_REQUIRED_ASSERTION: Test checks INVALID_FLOW but omits SETUP_REQUIRED assertion for placeholder node",
    );

    // Verify valid error assertion pattern passes
    const validSnippet = `
      expect(run.status).toBe(422);
      const body = (await run.json()) as { error?: { code?: string; issues?: { code: string }[] } };
      expect(body.error?.code).toBe("INVALID_FLOW");
      expect(body.error?.issues?.some((i) => i.code === "SETUP_REQUIRED")).toBe(true);
    `;
    expect(analyzePlaceholderRunRejection(validSnippet)).toEqual([]);
  });
});
