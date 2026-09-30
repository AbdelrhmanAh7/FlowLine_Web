# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: keyboard-surfaces.spec.ts >> @cross-browser remaining keyboard surfaces (DV2-K01–K05) >> desktop run details and nested rerun dialog each dismiss one layer and restore focus
- Location: e2e\keyboard-surfaces.spec.ts:182:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('step-panel').getByRole('tab', { name: 'Input', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('step-panel').getByRole('tab', { name: 'Input', exact: true }) with timeout 10000ms
  - waiting for getByTestId('step-panel').getByRole('tab', { name: 'Input', exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- complementary "Workspace navigation":
  - text: E2E 461247
  - navigation:
    - paragraph: Build
    - list:
      - listitem:
        - link "Flows":
          - /url: /w/e2e-461247/flows
      - listitem:
        - link "Canvas":
          - /url: /w/e2e-461247/canvas
      - listitem:
        - link "Templates":
          - /url: /w/e2e-461247/templates
    - paragraph: AI
    - list:
      - listitem:
        - link "Agents":
          - /url: /w/e2e-461247/agents
      - listitem:
        - link "Knowledge":
          - /url: /w/e2e-461247/knowledge
    - paragraph: Observe
    - list:
      - listitem:
        - link "Run history":
          - /url: /w/e2e-461247/runs
      - listitem:
        - link "Integrations":
          - /url: /w/e2e-461247/integrations
  - link "Settings":
    - /url: /w/e2e-461247/settings
  - button "E2E User"
- main:
  - heading "Run history" [level=1]
  - text: Search flows or run number
  - textbox "Search flows or run number":
    - /placeholder: "⌕ Search flows or #run id…"
  - group "Filter runs by status":
    - button "All runs" [pressed]
    - button "Succeeded"
    - button "Failed"
    - button "Running"
    - button "Needs attention"
    - button "Cancelled"
  - list "Runs":
    - listitem:
      - button "#1 Lead Qualifier Success 4/4 · 39ms now" [expanded]
      - list "Steps":
        - listitem:
          - button "Inbound lead Success · 0ms"
        - listitem:
          - button "Normalise lead Success · 1ms"
        - listitem:
          - button "50+ employees? Success · 0ms"
        - listitem:
          - button "Hot lead Success · 1ms" [pressed]
        - listitem:
          - button "Nurture Skipped"
  - heading "Hot lead Success" [level=2]
  - paragraph: "1ms · run #1 · v1 · output · hot · 1 attempt"
  - button "Close"
  - tablist "Step payload":
    - tab "input"
    - tab "output" [selected]
    - tab "error" [disabled]
    - tab "log"
  - text: This step didn't fail
  - tabpanel "output": "{ \"name\": \"Ada Lovelace\", \"tier\": \"hot\", \"domain\": \"analytical.io\" }"
  - button "↻ Re-run from this step"
  - paragraph: Shows exactly what will run again — and what might repeat an external action — before anything starts.
  - paragraph: Steps
  - 'button "Inbound lead: Success"'
  - 'button "Normalise lead: Success"'
  - 'button "50+ employees?: Success"'
  - 'button "Hot lead: Success" [pressed]'
  - 'button "Nurture: Skipped"'
  - paragraph: Run output
  - text: "{ \"hot_lead\": { \"name\": \"Ada Lovelace\", \"tier\": \"hot\", \"domain\": \"analytical.io\" } }"
- alert
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
> 10  |   await expect(launcher).toBeVisible();
      |                          ^ Error: expect(locator).toBeVisible() failed
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
  78  |     // This case checks the ready catalogue's Connect target; a delayed catalogue has its own fallback test below.
  79  |     await expect(page.locator("#connect-google_sheets")).toBeVisible();
  80  |     const connection = page.getByTestId("connection-google_sheets");
  81  |     await activate(page, connection.getByRole("button", { name: "Remove", exact: true }));
  82  |     await expect(connection.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  83  |     await page.keyboard.press("Escape");
  84  |     await expect(connection.getByRole("alertdialog")).toHaveCount(0);
  85  |     await expect(connection.getByRole("button", { name: "Remove", exact: true })).toBeFocused();
  86  |     await page.keyboard.press("Enter");
  87  |     await activate(page, connection.getByRole("button", { name: "Confirm remove", exact: true }));
  88  |     await expect(connection).toHaveCount(0);
  89  |     await expect(page.locator("#connect-google_sheets")).toBeFocused();
  90  |   });
  91  |   test("phone navigation traps focus, nested menu consumes Escape, and returns to launcher", async ({ page }) => {
  92  |     const { workspace } = await setupUser(page);
  93  |     await page.setViewportSize({ width: 375, height: 812 });
  94  |     await page.goto(`/w/${workspace.slug}/flows`);
  95  |     const launcher = page.getByRole("button", { name: "Open menu", exact: true });
  96  |     await activate(page, launcher);
  97  |     const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  98  |     await expect(drawer).toBeVisible();
  99  |     await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
  100 |     for (let i = 0; i < 22; i++) {
  101 |       await page.keyboard.press("Tab");
  102 |       expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  103 |     }
  104 |     await activate(page, drawer.getByRole("button", { name: "E2E User" }));
  105 |     await expect(page.getByRole("menu")).toBeVisible();
  106 |     await page.keyboard.press("Escape");
  107 |     await expect(page.getByRole("menu")).toHaveCount(0);
  108 |     await expect(drawer).toBeVisible();
  109 |     await page.keyboard.press("Escape");
  110 |     await expect(drawer).toHaveCount(0);
```