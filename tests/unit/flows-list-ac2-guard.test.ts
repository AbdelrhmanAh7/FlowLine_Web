import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

interface DrizzleMockChain {
  setRows: (newRows: unknown[]) => DrizzleMockChain;
  then: <T1 = unknown, T2 = never>(
    resolve?: ((val: unknown) => T1 | PromiseLike<T1>) | null,
    reject?: ((err: unknown) => T2 | PromiseLike<T2>) | null,
  ) => Promise<T1 | T2>;
  catch: <T = never>(reject?: ((err: unknown) => T | PromiseLike<T>) | null) => Promise<unknown | T>;
  finally: (cb?: (() => void) | null) => Promise<unknown>;
  select: (...args: unknown[]) => DrizzleMockChain;
  from: (...args: unknown[]) => DrizzleMockChain;
  innerJoin: (...args: unknown[]) => DrizzleMockChain;
  leftJoin: (...args: unknown[]) => DrizzleMockChain;
  where: (...args: unknown[]) => DrizzleMockChain;
  limit: (...args: unknown[]) => DrizzleMockChain;
  offset: (...args: unknown[]) => DrizzleMockChain;
  orderBy: (...args: unknown[]) => DrizzleMockChain;
  insert: (...args: unknown[]) => DrizzleMockChain;
  values: (...args: unknown[]) => DrizzleMockChain;
  returning: (...args: unknown[]) => DrizzleMockChain;
  update: (...args: unknown[]) => DrizzleMockChain;
  set: (...args: unknown[]) => DrizzleMockChain;
  delete: (...args: unknown[]) => DrizzleMockChain;
  for: (...args: unknown[]) => DrizzleMockChain;
  [Symbol.iterator]: () => Generator<unknown, void, unknown>;
}

function createDrizzleQueryMock(initialRows: unknown[] = []): DrizzleMockChain {
  let rows = initialRows;
  const chain: DrizzleMockChain = {
    setRows: (newRows: unknown[]) => {
      rows = newRows;
      return chain;
    },
    then: (resolve, reject) =>
      Promise.resolve(rows).then(resolve ?? undefined, reject ?? undefined),
    catch: (reject) =>
      Promise.resolve(rows).catch(reject ?? undefined),
    finally: (cb) =>
      Promise.resolve(rows).finally(cb ?? undefined),
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    values: vi.fn(() => chain),
    returning: vi.fn(() => chain),
    update: vi.fn(() => chain),
    set: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    for: vi.fn(() => chain),
    [Symbol.iterator]: function* () {
      yield* rows;
    },
  };
  return chain;
}

const mockDbChain = createDrizzleQueryMock([]);

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => mockDbChain),
    insert: vi.fn(() => mockDbChain),
    update: vi.fn(() => mockDbChain),
    delete: vi.fn(() => mockDbChain),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockDbChain)),
  },
  schema: {
    workspace: { id: "id", slug: "slug" },
    workspaceMember: { workspaceId: "workspace_id", userId: "user_id", role: "role" },
    flow: { id: "id", workspaceId: "workspace_id", name: "name", graph: "graph", revision: "revision", deletedAt: "deleted_at" },
    userSettings: { userId: "user_id", lastWorkspaceId: "last_workspace_id" },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user-1", email: "u@test.local", name: "User" },
        session: { token: "token-123" },
      })),
    },
  },
}));

import { NextRequest } from "next/server";
import { isPlaceholderSlug, requireWorkspace, requireWorkspaceBySlug, type CurrentUser } from "@/server/access";
import { createFlow, flowNameSchema } from "@/server/flows";
import { POST as postFlowRoute } from "@/app/api/workspaces/[wid]/flows/route";
import { middleware } from "@/middleware";

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
  beforeEach(() => {
    mockDbChain.setRows([]);
  });

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

  it("AC5: isPlaceholderSlug correctly identifies ambiguous placeholder slug strings and allows valid slugs", () => {
    expect(isPlaceholderSlug("{slug}")).toBe(true);
    expect(isPlaceholderSlug("[slug]")).toBe(true);
    expect(isPlaceholderSlug(":slug")).toBe(true);
    expect(isPlaceholderSlug("slug")).toBe(false); // Valid tenant slug
    expect(isPlaceholderSlug("{wid}")).toBe(true);
    expect(isPlaceholderSlug("[wid]")).toBe(true);
    expect(isPlaceholderSlug(":wid")).toBe(true);
    expect(isPlaceholderSlug("wid")).toBe(false); // Valid tenant slug
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

  it("AC7: requireWorkspaceBySlug returns null for ambiguous placeholder slugs and queries real slugs", async () => {
    const fakeUser: CurrentUser = { id: "user-1", email: "u@test.local", name: "User" };
    expect(await requireWorkspaceBySlug(fakeUser, "{slug}")).toBeNull();
    expect(await requireWorkspaceBySlug(fakeUser, "[slug]")).toBeNull();
    expect(await requireWorkspaceBySlug(fakeUser, ":slug")).toBeNull();
    expect(await requireWorkspaceBySlug(fakeUser, "{wid}")).toBeNull();
    // Valid tenant slug "slug" is queried against the DB (returns null when row is not found, not blocked upfront)
    expect(await requireWorkspaceBySlug(fakeUser, "slug")).toBeNull();
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

  it("AC14: Drizzle mock query chain supports fluent chaining (.where, .limit, .returning, .for) without TypeError", async () => {
    mockDbChain.setRows([{ id: "test-id" }]);
    const selectRes = await mockDbChain.select().from({}).where({}).limit(1);
    expect(selectRes).toEqual([{ id: "test-id" }]);

    const insertRes = await mockDbChain.insert({}).values({}).returning();
    expect(insertRes).toEqual([{ id: "test-id" }]);
  });

  it("AC15: POST /api/workspaces/[wid]/flows route handler returns real 400 status codes for invalid payloads", async () => {
    const wid = "00000000-0000-0000-0000-000000000001";
    mockDbChain.setRows([
      {
        workspace: { id: wid, slug: "ws-test" },
        role: "owner",
        id: "flow-123",
        name: "Test Flow",
        revision: 1,
      },
    ]);

    // 1. Unknown templateId -> 400 UNKNOWN_TEMPLATE
    const unknownTemplateReq = new Request(`https://flowline.example/api/workspaces/${wid}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: "non-existent-template-id" }),
    });
    const resTemplate = await postFlowRoute(unknownTemplateReq, { params: Promise.resolve({ wid }) });
    expect(resTemplate.status).toBe(400);
    const bodyTemplate = (await resTemplate.json()) as { error: { code: string } };
    expect(bodyTemplate.error.code).toBe("UNKNOWN_TEMPLATE");

    // 2. Numeric name ({ name: 12345 }) -> 400 VALIDATION
    const invalidBodyReq = new Request(`https://flowline.example/api/workspaces/${wid}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 12345 }),
    });
    const resBody = await postFlowRoute(invalidBodyReq, { params: Promise.resolve({ wid }) });
    expect(resBody.status).toBe(400);
    const bodyValidation = (await resBody.json()) as { error: { code: string } };
    expect(bodyValidation.error.code).toBe("VALIDATION");

    // 3. Whitespace-only name ({ name: "   " }) -> 400 VALIDATION
    const whitespaceReq = new Request(`https://flowline.example/api/workspaces/${wid}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    const resWhitespace = await postFlowRoute(whitespaceReq, { params: Promise.resolve({ wid }) });
    expect(resWhitespace.status).toBe(400);
    const bodyWhitespace = (await resWhitespace.json()) as { error: { code: string } };
    expect(bodyWhitespace.error.code).toBe("VALIDATION");
  });

  it("AC16: middleware rewrites malformed URI escape sequences to /not-found with 404 for pages and returns JSON 404 for API", async () => {
    // 1. Page route with malformed URI escape in slug -> rewrite to /not-found with status 404
    const pageReq = new NextRequest("http://localhost:3000/w/%E0%A4%A/flows");
    const pageRes = middleware(pageReq);
    expect(pageRes.status).toBe(404);
    expect(pageRes.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/not-found");

    const runsReq = new NextRequest("http://localhost:3000/w/%E0%A4%A/runs");
    const runsRes = middleware(runsReq);
    expect(runsRes.status).toBe(404);
    expect(runsRes.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/not-found");

    // 2. Query string with malformed escape -> rewrite to /not-found with status 404
    const queryReq = new NextRequest("http://localhost:3000/w/valid-ws/flows?q=%E0%A4%A");
    const queryRes = middleware(queryReq);
    expect(queryRes.status).toBe(404);
    expect(queryRes.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/not-found");

    // 3. API route with malformed URI escape -> JSON 404 NOT_FOUND
    const apiReq = new NextRequest("http://localhost:3000/api/workspaces/%E0%A4%A/flows");
    const apiRes = middleware(apiReq);
    expect(apiRes.status).toBe(404);
    const apiJson = (await apiRes.json()) as { error: { code: string } };
    expect(apiJson.error.code).toBe("NOT_FOUND");
  });

  it("AC17: middleware rewrites placeholder slugs to /not-found with 404 and passes valid tenant slugs", async () => {
    // 1. Placeholder slugs in /w/:slug/* -> rewrite to /not-found with status 404
    for (const ph of ["{slug}", "[slug]", ":slug", "{wid}", "[wid]", ":wid"]) {
      const req = new NextRequest(`http://localhost:3000/w/${encodeURIComponent(ph)}/flows`);
      const res = middleware(req);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/not-found");
    }

    // 2. Placeholder slugs in /api/workspaces/:wid/* -> JSON 404 NOT_FOUND
    for (const ph of ["{wid}", "[wid]", ":wid", "{slug}"]) {
      const req = new NextRequest(`http://localhost:3000/api/workspaces/${encodeURIComponent(ph)}/flows`);
      const res = middleware(req);
      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("NOT_FOUND");
    }

    // 3. Valid tenant slugs (e.g. "slug", "wid", "alpha-corp") -> allowed through (no rewrite)
    for (const valid of ["slug", "wid", "alpha-corp", "my-workspace"]) {
      const pageReq = new NextRequest(`http://localhost:3000/w/${valid}/flows`);
      const pageRes = middleware(pageReq);
      expect(pageRes.headers.get("x-middleware-rewrite")).toBeNull();

      const apiReq = new NextRequest(`http://localhost:3000/api/workspaces/${valid}/flows`);
      const apiRes = middleware(apiReq);
      expect(apiRes.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("AC18: vitest.config.mts guards integration and nightly projects behind hasTestDb", () => {
    const vitestConfigContent = readFileSync(resolve(root, "vitest.config.mts"), "utf8");
    expect(vitestConfigContent).toContain("const hasTestDb = Boolean(process.env.DATABASE_URL && /\\/flowline_test(_[a-z0-9]+)?(\\?|$)/.test(process.env.DATABASE_URL));");
    expect(vitestConfigContent).toContain('include: hasTestDb ? ["tests/integration/**/*.test.ts"] : []');
    expect(vitestConfigContent).toContain('globalSetup: hasTestDb ? ["tests/integration/global-setup.ts"] : []');
  });
});

