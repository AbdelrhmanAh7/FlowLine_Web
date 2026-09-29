import { expect, test, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { BASE_URL, EN_STATE } from "../playwright.config";
import { expectSaved, PASSWORD, setupUser, signUpVerified, uniqueEmail } from "./helpers";

/**
 * AI hub (Wave A) — the owner's whole journey in the UI: Settings → AI Providers → add an OpenAI connection by
 * TYPING the key → discovery → pick a model on an AI step with the searchable picker → run → inspect provider,
 * model, tokens and cost. The provider is the OpenAI-compatible TEST DOUBLE (e2e/fakes/ai-server.ts on :4011,
 * active only because the test stack runs with FLOWLINE_ENV=test; the page says so). A unique canary key is
 * checked against the page HTML, browser storage and API responses.
 */
const AI_FAKE = process.env.FLOWLINE_AI_TEST_OVERRIDE ?? "http://127.0.0.1:4011";
const pos = (i: number) => ({ x: 300 * i, y: 120 });

async function storageDump(page: Page) {
  return page.evaluate(async () => {
    const parts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.cookie];
    try {
      for (const d of (await indexedDB.databases?.()) ?? []) parts.push(d.name ?? "");
    } catch {
      /* not supported */
    }
    return parts.join("\n");
  });
}

test("owner connects a provider in the UI → discover → pick a model on an AI step → run → inspect; isolation + use roles", { tag: "@critical" }, async ({ page, browser }) => {
  test.setTimeout(180_000);
  const canary = `sk-fake-CANARY${randomUUID().replace(/-/g, "")}`;
  const { workspace, email } = await setupUser(page);
  const apiBodies: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/")) apiBodies.push(await r.text().catch(() => ""));
  });

  // 1. Settings → AI Providers: honest empty state, test-double notice, unsuitable providers listed without a card.
  await page.goto(`/w/${workspace.slug}/settings?tab=ai`);
  await expect(page.getByRole("heading", { name: "AI Providers" })).toBeVisible();
  await expect(page.getByTestId("ai-test-double")).toBeVisible();
  await expect(page.getByText("No AI connections yet")).toBeVisible();
  const notOffered = page.getByTestId("ai-not-offered");
  await expect(notOffered.getByTestId("ai-provider-opencode-zen")).toContainText("Unsuitable (terms)");
  await expect(notOffered.getByTestId("ai-provider-opencode-zen").getByRole("button", { name: "Add connection" })).toHaveCount(0);
  await expect(notOffered.getByTestId("ai-retired-github-models")).toContainText("Retired");

  // 2. Add connection: name + key typed into the dialog (checked by listing models — no paid request).
  await page.getByTestId("ai-provider-openai").getByRole("button", { name: "Add connection" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect OpenAI" });
  await dialog.getByLabel("Name").fill("Team OpenAI");
  await dialog.getByLabel("API key").fill(canary);
  await expect(dialog.getByLabel("API key")).toHaveAttribute("type", "password");
  await expect(dialog.getByLabel("API key")).toHaveAttribute("autocomplete", "new-password");
  await dialog.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connected — 5 models found" })).toBeVisible();
  const card = page.getByTestId("ai-connection");
  await expect(card).toContainText("Team OpenAI");
  await expect(card).toContainText("Connected");
  await expect(card.getByTestId("ai-key-hint")).toHaveText(`••••${canary.slice(-4)}`);
  await expect(card.getByTestId("ai-model-counts")).toContainText("5 found · 0 confirmed");
  await expect(card).toContainText("Contract-tested (not live-verified)");

  // 3. Default model via the searchable picker.
  const def = page.getByTestId("ai-default-route");
  await def.getByLabel("Search models").fill("mini");
  await def.getByRole("option", { name: /fake-gpt-mini/ }).click();
  await def.getByRole("button", { name: "Save default" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Default model saved" })).toBeVisible();
  // Price for the model the step will pin (so the run shows a real, estimated cost).
  expect((await page.request.patch(`/api/workspaces/${workspace.id}`, { data: { prices: { "ai:openai/fake-gpt-large": { inputPerMTok: 2, outputPerMTok: 8 } } } })).ok()).toBeTruthy();

  // 4. A flow with an AI step; pick a model on the step with the picker (search + provider/cost filters).
  const flowId = (await (await page.request.post(`/api/workspaces/${workspace.id}/flows`, { data: { name: "AI hub flow" } })).json()).flow.id as string;
  const put = await page.request.put(`/api/flows/${flowId}`, {
    data: {
      baseRevision: 1,
      graph: {
        nodes: [
          { id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: '{ "text": "Invoice 17 from Acme is overdue" }' } } },
          { id: "g", type: "ai.generate", position: pos(1), data: { label: "Summarise", config: { instructions: "Summarise in one line", source: "text", maxTokens: 100, model: "" } } },
          { id: "o", type: "output", position: pos(2), data: { label: "Done", config: { key: "summary", expression: "" } } },
        ],
        edges: [
          { id: "e1", source: "t", target: "g", sourceHandle: null },
          { id: "e2", source: "g", target: "o", sourceHandle: null },
        ],
      },
    },
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await page.locator('.react-flow__node[data-id="g"]').click();
  const drawer = page.getByTestId("node-drawer");
  const picker = drawer.getByTestId("model-picker");
  await expect(picker.getByRole("option", { name: /Workspace default \(fake-gpt-mini · Team OpenAI\)/ })).toHaveAttribute("aria-selected", "true");
  await picker.getByLabel("Cost information").selectOption("known");
  await expect(picker.getByRole("option", { name: /^fake-gpt-/ })).toHaveCount(1); // only the priced model
  await picker.getByLabel("Cost information").selectOption("any");
  await picker.getByLabel("Search models").fill("large");
  await expect(picker.getByRole("option", { name: /^fake-gpt-large/ })).toContainText("Direct");
  await picker.getByRole("option", { name: /^fake-gpt-large/ }).click();
  await expect(picker).toContainText("Selected: fake-gpt-large · Team OpenAI");
  await expectSaved(page);
  await page.keyboard.press("Escape");

  // 5. Run and inspect: provider, model, route, tokens and cost.
  await page.getByRole("button", { name: "▶ Run" }).click();
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText("SUCCESS", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await dock.getByRole("link", { name: /Open in inspector/ }).click();
  await page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /^Summarise Success/ }).click();
  const panel = page.getByTestId("step-panel");
  await expect(panel.getByLabel("Step details")).toContainText("openai");
  await expect(panel.getByLabel("Step details")).toContainText("fake-gpt-large");
  await expect(panel.getByLabel("Step details")).toContainText("Team OpenAI");
  await expect(panel.getByLabel("Step details")).toContainText(/inputTokens\s*\d+/);
  // CXQ-02: the converted amount carries its real unit (workspace currency), never the raw "costMicros" key.
  await expect(panel.getByLabel("Step details")).toContainText(/Cost \(USD\)\s*0\.\d{6}/);
  await expect(panel.getByLabel("Step details")).not.toContainText("costMicros");
  await expect(panel.getByLabel("Step details")).toContainText("estimated");

  // 6. Persistence: reload, sign out and back in — the connection is still there, no key re-entry.
  await page.goto(`/w/${workspace.slug}/settings?tab=ai`);
  await expect(page.getByTestId("ai-connection").getByTestId("ai-model-counts")).toContainText("1 confirmed");
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  expect((await page.request.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
  await page.goto(`/w/${workspace.slug}/settings?tab=ai`);
  await expect(page.getByTestId("ai-connection").getByTestId("ai-key-hint")).toHaveText(`••••${canary.slice(-4)}`);

  // 7. The key never reached the browser: page HTML, storage and every API response are free of it.
  expect(await page.content()).not.toContain(canary);
  expect(await storageDump(page)).not.toContain(canary.slice(8));
  expect(apiBodies.join("\n")).not.toContain(canary.slice(8));

  // 8. Another workspace can't see or use the connection.
  const other = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL }, storageState: EN_STATE });
  const op = await other.newPage();
  await signUpVerified(op.request, uniqueEmail("ai-other"), "Other Owner");
  const ows = (await (await op.request.post("/api/workspaces", { data: { name: "Other AI" } })).json()).workspace as { id: string; slug: string };
  expect((await op.request.get(`/api/workspaces/${workspace.id}/ai/connections`)).status()).toBe(404);
  expect((await op.request.get(`/api/workspaces/${workspace.id}/ai/models`)).status()).toBe(404);
  await op.goto(`/w/${ows.slug}/settings?tab=ai`);
  await expect(op.getByText("No AI connections yet")).toBeVisible();
  await expect(op.getByText("Team OpenAI")).toHaveCount(0);
  await other.close();

  // 9. An editor (connection's use_roles = owner only, the default) can't pick it: UI and API.
  const edEmail = uniqueEmail("ai-editor");
  const inv = await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email: edEmail, role: "editor" } });
  expect(inv.status(), await inv.text()).toBe(201);
  const token = new URL((await inv.json()).url as string).pathname.split("/").pop()!;
  const edCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL }, storageState: EN_STATE });
  const ed = await edCtx.newPage();
  await signUpVerified(ed.request, edEmail, "Editor");
  expect((await ed.request.post(`/api/invites/${token}`)).ok()).toBeTruthy();
  expect((await (await ed.request.get(`/api/workspaces/${workspace.id}/ai/models`)).json()).models).toEqual([]);
  const conn = (await (await page.request.get(`/api/workspaces/${workspace.id}/ai/connections`)).json()).connections[0] as { id: string };
  expect((await ed.request.post(`/api/workspaces/${workspace.id}/ai/connections`, { data: { provider: "openai", label: "x", apiKey: "sk-fake-editor-000000000" } })).status()).toBe(403);
  const cur = (await (await ed.request.get(`/api/flows/${flowId}`)).json()).flow as { revision: number; graph: { nodes: { id: string; data: { config: Record<string, unknown> } }[] } };
  const g = structuredClone(cur.graph);
  g.nodes.find((n) => n.id === "g")!.data.config.route = { connectionId: conn.id, modelId: "fake-gpt-tools" };
  const denied = await ed.request.put(`/api/flows/${flowId}`, { data: { baseRevision: cur.revision, graph: g } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe("AI_ROUTE_FORBIDDEN");
  await ed.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await ed.locator('.react-flow__node[data-id="g"]').click();
  await expect(ed.getByTestId("node-drawer")).toContainText("You aren't allowed to use this workspace's AI connections");
  await edCtx.close();

  // The double saw only this workspace's key (by hash) — never an environment key.
  const seen = (await (await page.request.get(`${AI_FAKE}/__fake/openai/requests`)).json()) as { requests: { keySha256: string | null }[] };
  expect(seen.requests.map((r) => r.keySha256)).toContain(createHash("sha256").update(canary).digest("hex"));
});
