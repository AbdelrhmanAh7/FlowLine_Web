// Skill: e2e-army
// Title: @issue-119 Platform admin panel failing on main — Copy page loads without error
// Test for feature: fl-platform-admin (platform admin panel)

import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-119 Platform admin copy page loads without error", { tags: ["feat:fl-platform-admin"] }, async ({ app, screen }) => {
  // Setup: Navigate to /admin/copy with valid admin credentials
  await app.open("/en/admin/copy");

  // Wait for the page to load
  await screen.waitForSelector("h1");

  // Assertion: Page loads, no error
  const title = await screen.getByText("Copy editor");
  expect(title).toBeVisible();

  // Check for loading state
  const loading = await screen.getByText("Loading…");
  expect(loading).not.toBeVisible();

  // Edge case: Check for error message
  const error = await screen.getByRole("alert");
  expect(error).not.toBeVisible();

  // Arabic/RTL check
  const dir = await screen.evaluate(() => document.documentElement.dir);
  expect(dir).toBe("ltr"); // English page, should be LTR

  // Verify the page structure
  const searchInput = await screen.getByLabel("Search keys or text");
  expect(searchInput).toBeVisible();

  const groupSelect = await screen.getByLabel("Group");
  expect(groupSelect).toBeVisible();
});
