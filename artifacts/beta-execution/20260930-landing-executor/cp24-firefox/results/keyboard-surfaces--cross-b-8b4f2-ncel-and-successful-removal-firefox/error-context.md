# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: keyboard-surfaces.spec.ts >> @cross-browser remaining keyboard surfaces (DV2-K01–K05) >> inline destructive confirmations preserve focus through cancel and successful removal
- Location: e2e/keyboard-surfaces.spec.ts:17:7

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  locator('#connect-google_sheets')
Expected: focused
Received: inactive
Timeout:  10000ms

Call log:
  - Expect "toBeFocused" locator('#connect-google_sheets') with timeout 10000ms
  - waiting for locator('#connect-google_sheets')
    22 × locator resolved to <button type="button" id="connect-google_sheets" class="motion-press inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)] active:duration-[var(--dur-fast)] bg-card text-hi border border-line-strong hover:bg-elevated h-7 px-2.5 text-sm gap-1.5 rounded-md">Connect</button>
       - unexpected value "inactive"

```

```yaml
- button "Connect"
```

# Test source

```ts
  1   | import { expect, test, type Locator, type Page } from "@playwright/test";
  2   | import { setupUser, signUpVerified, uniqueEmail } from "./helpers";
  3   | import { BASE_URL } from "../playwright.config";
  4   | 
  5   | // This file now exercises a write-only API-key reveal; never capture it in failure evidence.
  6   | test.use({ trace: "off", screenshot: "off", video: "off" });
  7   | 
  8   | async function activate(page: Page, launcher: Locator) {
  9   |   // React Flow initially hides nodes until measured; focus() itself does not wait for visibility.
  10  |   await expect(launcher).toBeVisible();
  11  |   await launcher.focus();
  12  |   await expect(launcher).toBeFocused();
  13  |   await page.keyboard.press("Enter");
  14  | }
  15  | 
  16  | test.describe("@cross-browser remaining keyboard surfaces (DV2-K01–K05)", () => {
  17  |   test("inline destructive confirmations preserve focus through cancel and successful removal", async ({ page, playwright }) => {
  18  |     const { workspace } = await setupUser(page);
  19  |     const base = `/w/${workspace.slug}`;
  20  |     await page.goto(`${base}/knowledge`);
  21  |     await page.locator("#kn-title").fill("Keyboard source");
  22  |     await page.locator("#kn-text").fill("Synthetic keyboard source.");
  23  |     await activate(page, page.getByRole("button", { name: "Add text", exact: true }));
  24  |     const source = page.getByTestId("source-Keyboard source");
  25  |     await expect(source).toBeVisible();
  26  |     await activate(page, source.getByRole("button", { name: "Delete", exact: true }));
  27  |     await expect(source.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
  28  |     await page.keyboard.press("Escape");
  29  |     await expect(source.getByRole("alertdialog")).toHaveCount(0);
  30  |     await expect(source.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  31  |     await page.keyboard.press("Enter");
  32  |     await activate(page, source.getByRole("button", { name: "Confirm delete", exact: true }));
  33  |     await expect(source).toHaveCount(0);
  34  |     await expect(page.locator("#knowledge-upload")).toBeFocused();
  35  | 
  36  |     await page.goto(`${base}/settings?tab=keys`);
  37  |     await page.locator("#key-name").fill("Keyboard key");
  38  |     await activate(page, page.getByRole("button", { name: "Create key", exact: true }));
  39  |     const key = page.getByTestId("apikey-Keyboard key");
  40  |     await expect(key).toBeVisible();
  41  |     await activate(page, key.getByRole("button", { name: "Revoke", exact: true }));
  42  |     await expect(key.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
  43  |     await page.keyboard.press("Escape");
  44  |     await expect(key.getByRole("alertdialog")).toHaveCount(0);
  45  |     await expect(key.getByRole("button", { name: "Revoke", exact: true })).toBeFocused();
  46  |     await page.keyboard.press("Enter");
  47  |     await activate(page, key.getByRole("button", { name: "Confirm revoke", exact: true }));
  48  |     await expect(key.getByRole("button", { name: "Revoke", exact: true })).toHaveCount(0);
  49  |     await expect(page.locator("#key-create")).toBeFocused();
  50  | 
  51  |     const email = uniqueEmail("keyboard-member");
  52  |     const invited = await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email, role: "editor" } });
  53  |     expect(invited.ok()).toBe(true);
  54  |     const { url } = await invited.json();
  55  |     const other = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  56  |     try {
  57  |       await signUpVerified(other, email, "Keyboard member");
  58  |       expect((await other.post(`/api/invites/${new URL(url).pathname.split("/").pop()}`)).ok()).toBe(true);
  59  |       await page.goto(`${base}/settings?tab=members`);
  60  |       const member = page.getByRole("listitem").filter({ hasText: email });
  61  |       await activate(page, member.getByRole("button", { name: "Remove", exact: true }));
  62  |       await expect(member.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
  63  |       await page.keyboard.press("Escape");
  64  |       await expect(member.getByRole("alertdialog")).toHaveCount(0);
  65  |       await expect(member.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
  66  |       await page.keyboard.press("Enter");
  67  |       await activate(page, member.getByRole("button", { name: "Confirm remove", exact: true }));
  68  |       await expect(member).toHaveCount(0);
  69  |       await expect(page.locator("#invite-email")).toBeFocused();
  70  |     } finally { await other.dispose(); }
  71  | 
  72  |     // Removal revokes the provider token: never revoke the shared test-token used by later specs.
  73  |     const issued = await page.request.post("http://127.0.0.1:4010/__fake/issue-token", { data: { account: "a" } });
  74  |     expect(issued.ok()).toBe(true);
  75  |     const { token } = await issued.json();
  76  |     expect((await page.request.post(`/api/workspaces/${workspace.id}/connections`, { data: { provider: "google_sheets", label: "Keyboard", fields: { token } } })).ok()).toBe(true);
  77  |     await page.goto(`${base}/integrations`);
  78  |     const connection = page.getByTestId("connection-google_sheets");
  79  |     await activate(page, connection.getByRole("button", { name: "Remove", exact: true }));
  80  |     await expect(connection.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  81  |     await page.keyboard.press("Escape");
  82  |     await expect(connection.getByRole("alertdialog")).toHaveCount(0);
  83  |     await expect(connection.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
  84  |     await page.keyboard.press("Enter");
  85  |     await activate(page, connection.getByRole("button", { name: "Confirm remove", exact: true }));
  86  |     await expect(connection).toHaveCount(0);
> 87  |     await expect(page.locator("#connect-google_sheets")).toBeFocused();
      |                                                          ^ Error: expect(locator).toBeFocused() failed
  88  |   });
  89  |   test("phone navigation traps focus, nested menu consumes Escape, and returns to launcher", async ({ page }) => {
  90  |     const { workspace } = await setupUser(page);
  91  |     await page.setViewportSize({ width: 375, height: 812 });
  92  |     await page.goto(`/w/${workspace.slug}/flows`);
  93  |     const launcher = page.getByRole("button", { name: "Open menu", exact: true });
  94  |     await activate(page, launcher);
  95  |     const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  96  |     await expect(drawer).toBeVisible();
  97  |     await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
  98  |     for (let i = 0; i < 22; i++) {
  99  |       await page.keyboard.press("Tab");
  100 |       expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  101 |     }
  102 |     await activate(page, drawer.getByRole("button", { name: "E2E User" }));
  103 |     await expect(page.getByRole("menu")).toBeVisible();
  104 |     await page.keyboard.press("Escape");
  105 |     await expect(page.getByRole("menu")).toHaveCount(0);
  106 |     await expect(drawer).toBeVisible();
  107 |     await page.keyboard.press("Escape");
  108 |     await expect(drawer).toHaveCount(0);
  109 |     await expect(launcher).toBeFocused();
  110 |   });
  111 | 
  112 |   test("node drawer Escape from a text field returns to the canvas node; dock returns to launcher", async ({ page }) => {
  113 |     const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  114 |     await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  115 |     const node = page.locator(".react-flow__node").first();
  116 |     await activate(page, node);
  117 |     const drawer = page.getByTestId("node-drawer");
  118 |     await expect(drawer.getByRole("heading").first()).toBeFocused();
  119 |     await drawer.getByRole("textbox").first().focus();
  120 |     await page.keyboard.press("Escape");
  121 |     await expect(drawer).toHaveCount(0);
  122 |     await expect(node).toBeFocused();
  123 |     const runs = page.getByRole("button", { name: /^Runs/ });
  124 |     await activate(page, runs);
  125 |     const dock = page.getByTestId("run-dock");
  126 |     expect(await dock.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  127 |     await page.keyboard.press("Escape");
  128 |     await expect(dock).toHaveCount(0);
  129 |     await expect(runs).toBeFocused();
  130 |   });
  131 | 
  132 |   test("OAuth switch/remove confirmations focus Cancel, allow leaving, dismiss and restore focus", async ({ page }) => {
  133 |     test.setTimeout(90_000);
  134 |     const { workspace } = await setupUser(page);
  135 |     const base = `/api/workspaces/${workspace.id}/oauth-apps/google`;
  136 |     const created = await page.request.put(base, { data: { clientId: "keyboard-original", secret: "fake-keyboard-client-secret", expectedRevision: 0 } });
  137 |     expect(created.ok()).toBe(true);
  138 |     await page.goto(`/w/${workspace.slug}/settings?tab=oauthApps`);
  139 |     const card = page.getByTestId("oauth-app-google");
  140 |     for (const label of ["Remove", "Save app"]) {
  141 |       if (label === "Save app") await card.getByLabel("Client ID").fill("keyboard-replacement");
  142 |       const launcher = card.getByRole("button", { name: label, exact: true });
  143 |       await activate(page, launcher);
  144 |       const confirmation = card.getByRole("alertdialog");
  145 |       await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
  146 |       await page.keyboard.press("Tab");
  147 |       expect(await confirmation.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  148 |       await confirmation.getByRole("button", { name: "Cancel" }).focus();
  149 |       await page.keyboard.press("Escape");
  150 |       await expect(confirmation).toHaveCount(0);
  151 |       await expect(launcher).toBeFocused();
  152 |     }
  153 |     await activate(page, card.getByRole("button", { name: "Remove", exact: true }));
  154 |     await activate(page, card.getByRole("button", { name: "Confirm", exact: true }));
  155 |     await expect(card.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  156 |     await expect(card.getByLabel("Client ID")).toBeFocused();
  157 |   });
  158 | 
  159 |   test("desktop run details and nested rerun dialog each dismiss one layer and restore focus", async ({ page }) => {
  160 |     const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  161 |     const started = await page.request.post(`/api/flows/${flowId}/runs`, { data: { clientRequestId: crypto.randomUUID() } });
  162 |     expect(started.ok()).toBe(true);
  163 |     const { run } = await started.json();
  164 |     await expect.poll(async () => (await (await page.request.get(`/api/runs/${run.id}`)).json()).run.status).toBe("succeeded");
  165 |     await page.goto(`/w/${workspace.slug}/runs`);
  166 |     // The newest run may be selected by default. Close it before testing the row launcher.
  167 |     const panel = page.getByTestId("step-panel");
  168 |     await expect(panel).toBeVisible();
  169 |     await activate(page, panel.getByRole("button", { name: "Close", exact: true }));
  170 |     await expect(panel).toHaveCount(0);
  171 |     const row = page.locator(`#run-row-${run.id}`);
  172 |     await activate(page, row);
  173 |     await expect(panel.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  174 |     const rerun = panel.getByRole("button", { name: /Re-run from this step/ });
  175 |     await activate(page, rerun);
  176 |     await expect(page.getByRole("dialog")).toBeVisible();
  177 |     await page.keyboard.press("Escape");
  178 |     await expect(page.getByRole("dialog")).toHaveCount(0);
  179 |     await expect(panel).toBeVisible();
  180 |     await expect(rerun).toBeFocused();
  181 |     await page.keyboard.press("Escape");
  182 |     await expect(panel).toHaveCount(0);
  183 |     await expect(row).toBeFocused();
  184 |   });
  185 | });
  186 | 
```