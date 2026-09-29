import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { connectAiApi, FAKE_AI_MODEL, setupUser } from "./helpers";

/**
 * AI hub Wave B UI: provider-specific connect dialog (fields, coding-plan warning, required pay-as-you-go attestation,
 * no-list-endpoint note), routing policy card (FALLBACK with one route), agent form model picker. Provider = the
 * protocol-accurate TEST DOUBLE (e2e/fakes/ai-protocols.ts); keys are typed in the UI.
 */
test("Z.ai connect dialog: provider warning, required attestation, key can't be checked by listing", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/settings?tab=ai`);
  await page.getByTestId("ai-provider-zai").getByRole("button", { name: "Add connection" }).click();
  const dialog = page.getByRole("dialog", { name: /Connect Z\.ai/ });
  await expect(dialog.getByTestId("ai-plan-warning")).toContainText("GLM Coding Plan keys are not accepted");
  await expect(dialog).toContainText("no model-list endpoint");
  await dialog.getByLabel("Name").fill("Z.ai PAYG");
  await dialog.getByLabel("API key", { exact: true }).fill(`sk-fake-zai-${randomUUID().replace(/-/g, "")}`);
  const save = dialog.getByRole("button", { name: "Check and save" });
  await expect(save).toHaveAttribute("aria-disabled", "true"); // attestation first
  await dialog.getByTestId("ai-attest").getByRole("checkbox").check();
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: /Connected — \d+ models found/ })).toBeVisible();
  await expect(page.getByTestId("ai-connection").getByTestId("ai-key-unchecked")).toBeVisible();
});

test("Alibaba connect dialog shows region + workspace ID fields and blocks an invalid workspace ID", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/settings?tab=ai`);
  await page.getByTestId("ai-provider-dashscope").getByRole("button", { name: "Add connection" }).click();
  const dialog = page.getByRole("dialog", { name: /Connect Alibaba Cloud Model Studio/ });
  await expect(dialog.getByLabel("Region")).toHaveValue("ap-southeast-1");
  await dialog.getByLabel("Workspace ID").fill("evil.example.com");
  await dialog.getByTestId("ai-attest").getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Check and save" })).toHaveAttribute("aria-disabled", "true");
  await dialog.getByLabel("Workspace ID").fill("ws-e2e-1");
  await dialog.getByLabel("API key", { exact: true }).fill(`sk-fake-ds-${randomUUID().replace(/-/g, "")}`);
  await dialog.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Connected — \d+ models found/ })).toBeVisible();
});

test("routing policy: owner saves FALLBACK with one route; an agent picks its own model", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await connectAiApi(page.request, workspace.id);
  const key = `sk-fake-anth-${randomUUID().replace(/-/g, "")}`;
  const res = await page.request.post(`/api/workspaces/${workspace.id}/ai/connections`, { data: { provider: "anthropic", label: "Claude (double)", apiKey: key } });
  expect(res.status(), await res.text()).toBe(201);

  await page.goto(`/w/${workspace.slug}/settings?tab=ai`);
  const policy = page.getByTestId("ai-policy");
  await policy.getByLabel("Fallback").check();
  await expect(policy.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true"); // needs a route
  const list = policy.getByTestId("ai-policy-fallbacks");
  await list.getByText("Add a route…").click();
  await list.getByLabel("Search models").fill("fake-claude");
  await list.getByRole("option", { name: /^fake-claude\b/ }).first().click();
  await list.getByRole("button", { name: "Add to list" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await policy.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Policy saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("ai-policy").getByLabel("Fallback")).toBeChecked();
  await expect(page.getByTestId("ai-policy-fallbacks").getByRole("listitem")).toContainText("fake-claude");

  await page.goto(`/w/${workspace.slug}/agents/new`);
  const route = page.getByTestId("agent-ai-route");
  await expect(route.getByRole("option", { name: new RegExp(`Workspace default \\(${FAKE_AI_MODEL}`) })).toHaveAttribute("aria-selected", "true");
  await route.getByLabel("Search models").fill("fake-claude");
  await route.getByRole("option", { name: /^fake-claude\b/ }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Claude agent");
  await page.getByLabel("Instructions").fill("Answer briefly.");
  await page.getByRole("button", { name: /Create agent|Save/ }).first().click();
  await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/);
  // The pinned route is shown on the agent's Configuration tab (the detail page opens on Chat).
  await page.getByRole("tab", { name: "Configuration" }).click();
  await expect(page.getByTestId("agent-ai-route")).toContainText("This version runs on");
  await expect(page.getByTestId("agent-ai-route")).toContainText("fake-claude");
});
