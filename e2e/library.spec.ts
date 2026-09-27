import { expect, test } from "@playwright/test";
import { setupUser } from "./helpers";

test("templates: a local template creates a flow and opens the canvas; design templates list their real requirements", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/templates`);
  const lead = page.getByTestId("template-lead-enrichment");
  await expect(lead.getByRole("list", { name: "Requirements" })).toContainText("Not connected");
  await expect(lead.getByRole("list", { name: "Requirements" })).toContainText("AI available");
  await expect(lead).not.toContainText(/d+ (uses|runs|installs)/); // no invented usage counts

  await page.getByRole("button", { name: "Support", exact: true }).click();
  await expect(page.getByText("Lead Qualifier")).toHaveCount(0);
  await page.getByRole("listitem").filter({ hasText: "Ticket Priority Router" }).getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.getByLabel("Flow name")).toHaveValue("Ticket Priority Router");
});

test("settings: owner renames the workspace and sets a timezone; values persist; unavailable features explain themselves", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/settings`);
  await expect(page.getByText("(you)")).toBeVisible();
  // Invites shipped in Phase 3 (was a disabled "Phase 3" control); the full journey is in phase3.spec.ts.
  const invite = page.getByRole("button", { name: "Create invite link" });
  await expect(invite).toHaveAccessibleDescription("Enter an email");
  await page.getByLabel("Email").fill("someone@example.test");
  await expect(invite).not.toHaveAttribute("aria-disabled", "true");

  await page.getByRole("button", { name: "General" }).click();
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toHaveAccessibleDescription("No changes to save");
  await page.getByLabel("Workspace name").fill("Renamed Workspace");
  await page.getByLabel("Schedule timezone").selectOption("Africa/Cairo");
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "Workspace settings saved" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "General" }).click();
  await expect(page.getByLabel("Workspace name")).toHaveValue("Renamed Workspace");
  await expect(page.getByLabel("Schedule timezone")).toHaveValue("Africa/Cairo");
  await expect(page.getByRole("complementary", { name: "Workspace navigation" })).toContainText("Renamed Workspace");

  await page.getByRole("button", { name: "Usage & limits" }).click();
  await expect(page.getByText("No usage yet this month.")).toBeVisible();
  await expect(page.getByText(/\$\d/)).toHaveCount(0); // no invented prices or credits
});
