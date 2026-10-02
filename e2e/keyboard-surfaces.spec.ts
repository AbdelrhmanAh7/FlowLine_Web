import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupUser, signUpVerified, uniqueEmail } from "./helpers";
import { BASE_URL } from "../playwright.config";
import { FAKE_PROVIDER } from "./stack";

// This file now exercises a write-only API-key reveal; never capture it in failure evidence.
test.use({ trace: "off", screenshot: "off", video: "off" });

async function activate(page: Page, launcher: Locator) {
  // React Flow initially hides nodes until measured; focus() itself does not wait for visibility.
  await expect(launcher).toBeVisible();
  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
}

test.describe("@cross-browser remaining keyboard surfaces (DV2-K01–K05)", () => {
  test("inline destructive confirmations preserve focus through cancel and successful removal", async ({ page, playwright }) => {
    const { workspace } = await setupUser(page);
    const base = `/w/${workspace.slug}`;
    await page.goto(`${base}/knowledge`);
    await page.locator("#kn-title").fill("Keyboard source");
    await page.locator("#kn-text").fill("Synthetic keyboard source.");
    await activate(page, page.getByRole("button", { name: "Add text", exact: true }));
    const source = page.getByTestId("source-Keyboard source");
    await expect(source).toBeVisible();
    await activate(page, source.getByRole("button", { name: "Delete", exact: true }));
    await expect(source.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(source.getByRole("alertdialog")).toHaveCount(0);
    await expect(source.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await activate(page, source.getByRole("button", { name: "Confirm delete", exact: true }));
    await expect(source).toHaveCount(0);
    await expect(page.locator("#knowledge-upload")).toBeFocused();

    await page.goto(`${base}/settings?tab=keys`);
    await page.locator("#key-name").fill("Keyboard key");
    await activate(page, page.getByRole("button", { name: "Create key", exact: true }));
    const key = page.getByTestId("apikey-Keyboard key");
    await expect(key).toBeVisible();
    await activate(page, key.getByRole("button", { name: "Revoke", exact: true }));
    await expect(key.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(key.getByRole("alertdialog")).toHaveCount(0);
    await expect(key.getByRole("button", { name: "Revoke", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await activate(page, key.getByRole("button", { name: "Confirm revoke", exact: true }));
    await expect(key.getByRole("button", { name: "Revoke", exact: true })).toHaveCount(0);
    await expect(page.locator("#key-create")).toBeFocused();

    const email = uniqueEmail("keyboard-member");
    const invited = await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email, role: "editor" } });
    expect(invited.ok()).toBe(true);
    const { url } = await invited.json();
    const other = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
    try {
      await signUpVerified(other, email, "Keyboard member");
      expect((await other.post(`/api/invites/${new URL(url).pathname.split("/").pop()}`)).ok()).toBe(true);
      await page.goto(`${base}/settings?tab=members`);
      const member = page.getByRole("listitem").filter({ hasText: email });
      await activate(page, member.getByRole("button", { name: "Remove", exact: true }));
      await expect(member.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(member.getByRole("alertdialog")).toHaveCount(0);
      await expect(member.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await activate(page, member.getByRole("button", { name: "Confirm remove", exact: true }));
      await expect(member).toHaveCount(0);
      await expect(page.locator("#invite-email")).toBeFocused();
    } finally { await other.dispose(); }

    // Removal revokes the provider token: never revoke the shared test-token used by later specs.
    const issued = await page.request.post(`${FAKE_PROVIDER}/__fake/issue-token`, { data: { account: "a" } });
    expect(issued.ok()).toBe(true);
    const { token } = await issued.json();
    expect((await page.request.post(`/api/workspaces/${workspace.id}/connections`, { data: { provider: "google_sheets", label: "Keyboard", fields: { token } } })).ok()).toBe(true);
    await page.goto(`${base}/integrations`);
    // This case checks the ready catalogue's Connect target; a delayed catalogue has its own fallback test below.
    await expect(page.locator("#connect-google_sheets")).toBeVisible();
    const connection = page.getByTestId("connection-google_sheets");
    await activate(page, connection.getByRole("button", { name: "Remove", exact: true }));
    await expect(connection.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(connection.getByRole("alertdialog")).toHaveCount(0);
    await expect(connection.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await activate(page, connection.getByRole("button", { name: "Confirm remove", exact: true }));
    await expect(connection).toHaveCount(0);
    await expect(page.locator("#connect-google_sheets")).toBeFocused();
  });
  test("phone navigation traps focus, nested menu consumes Escape, and returns to launcher", async ({ page }) => {
    const { workspace } = await setupUser(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/w/${workspace.slug}/flows`);
    const launcher = page.getByRole("button", { name: "Open menu", exact: true });
    await activate(page, launcher);
    const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press("Tab");
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await activate(page, drawer.getByRole("button", { name: "E2E User" }));
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });

  test("node drawer Escape from a text field returns to the canvas node; dock returns to launcher", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    const node = page.locator(".react-flow__node").first();
    await activate(page, node);
    const drawer = page.getByTestId("node-drawer");
    await expect(drawer.getByRole("heading").first()).toBeFocused();
    await drawer.getByRole("textbox").first().focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(node).toBeFocused();
    const runs = page.getByRole("button", { name: /^Runs/ });
    await activate(page, runs);
    const dock = page.getByTestId("run-dock");
    expect(await dock.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dock).toHaveCount(0);
    await expect(runs).toBeFocused();
  });

  test("OAuth switch/remove confirmations focus Cancel, allow leaving, dismiss and restore focus", async ({ page }) => {
    test.setTimeout(90_000);
    const { workspace } = await setupUser(page);
    const base = `/api/workspaces/${workspace.id}/oauth-apps/google`;
    const created = await page.request.put(base, { data: { clientId: "keyboard-original", secret: "fake-keyboard-client-secret", expectedRevision: 0 } });
    expect(created.ok()).toBe(true);
    await page.goto(`/w/${workspace.slug}/settings?tab=oauthApps`);
    const card = page.getByTestId("oauth-app-google");
    for (const label of ["Remove", "Save app"]) {
      if (label === "Save app") await card.getByLabel("Client ID").fill("keyboard-replacement");
      const launcher = card.getByRole("button", { name: label, exact: true });
      await activate(page, launcher);
      const confirmation = card.getByRole("alertdialog");
      await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Tab");
      expect(await confirmation.evaluate((el) => el.contains(document.activeElement))).toBe(false);
      await confirmation.getByRole("button", { name: "Cancel" }).focus();
      await page.keyboard.press("Escape");
      await expect(confirmation).toHaveCount(0);
      await expect(launcher).toBeFocused();
    }
    await activate(page, card.getByRole("button", { name: "Remove", exact: true }));
    await activate(page, card.getByRole("button", { name: "Confirm", exact: true }));
    await expect(card.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    await expect(card.getByLabel("Client ID")).toBeFocused();
  });
  test("connection removal keeps focus useful while the catalogue is pending", async ({ page }) => {
    const { workspace } = await setupUser(page);
    const issued = await page.request.post(`${FAKE_PROVIDER}/__fake/issue-token`, { data: { account: "a" } });
    expect(issued.ok()).toBe(true);
    const { token } = await issued.json();
    expect((await page.request.post(`/api/workspaces/${workspace.id}/connections`, { data: { provider: "google_sheets", label: "Pending catalogue", fields: { token } } })).ok()).toBe(true);
    let releaseCatalog!: () => void;
    const pending = new Promise<void>((resolve) => { releaseCatalog = resolve; });
    await page.route("**/api/integrations/catalog?*", async (route) => { await pending; await route.continue(); });
    try {
      await page.goto(`/w/${workspace.slug}/integrations`);
      const connection = page.getByTestId("connection-google_sheets");
      await expect(page.locator("#connect-google_sheets")).toHaveCount(0);
      await activate(page, connection.getByRole("button", { name: "Remove", exact: true }));
      await activate(page, connection.getByRole("button", { name: "Confirm remove", exact: true }));
      await expect(connection).toHaveCount(0);
      await expect(page.locator("#int-search")).toBeFocused();
    } finally { releaseCatalog(); }
    await expect(page.locator("#connect-google_sheets")).toBeVisible();
    await expect(page.locator("#int-search")).toBeFocused();
  });

  test("desktop run details and nested rerun dialog each dismiss one layer and restore focus", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    const started = await page.request.post(`/api/flows/${flowId}/runs`, { data: { clientRequestId: crypto.randomUUID() } });
    expect(started.ok()).toBe(true);
    const { run } = await started.json();
    await expect.poll(async () => (await (await page.request.get(`/api/runs/${run.id}`)).json()).run.status).toBe("succeeded");
    await page.goto(`/w/${workspace.slug}/runs`);
    // The newest run may be selected by default. Close it before testing the row launcher.
    const panel = page.getByTestId("step-panel");
    await expect(panel).toBeVisible();
    await activate(page, panel.getByRole("button", { name: "Close", exact: true }));
    await expect(panel).toHaveCount(0);
    const row = page.locator(`#run-row-${run.id}`);
    await activate(page, row);
    await expect(panel.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    const inputTab = panel.getByRole("tab", { name: "input", exact: true });
    await activate(page, inputTab);
    await page.keyboard.press("Tab");
    const blockedError = panel.getByRole("tab", { name: "error", exact: true });
    await expect(blockedError).toBeFocused();
    await expect(blockedError).toHaveAttribute("aria-disabled", "true");
    await expect(blockedError).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tooltip")).toContainText("This step didn't fail");
    // A cancelled touch gesture must not leave stale pointer state for the next keyboard activation.
    await blockedError.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1 });
    await blockedError.dispatchEvent("pointercancel", { pointerType: "touch", pointerId: 1 });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tooltip")).toContainText("This step didn't fail");
    await expect(blockedError).toHaveAttribute("aria-selected", "false");
    // Arrow keys reach the explained blocked tab too (focus, no selection); Enter/Space never select it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await inputTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(blockedError).toBeFocused();
    await expect(blockedError).toHaveAttribute("aria-selected", "false");
    await expect(inputTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tooltip")).toContainText("This step didn't fail");
    await page.keyboard.press("ArrowLeft");
    await expect(inputTab).toBeFocused();
    await expect(panel).toBeVisible();
    const rerun = panel.getByRole("button", { name: /Re-run from this step/ });
    await activate(page, rerun);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(rerun).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(row).toBeFocused();
  });
});
