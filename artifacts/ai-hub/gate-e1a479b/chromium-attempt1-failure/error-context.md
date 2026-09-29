# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase2.spec.ts >> template journey: connect apps via OAuth, finish setup in the canvas, Sheets fails, re-run from that step without duplicates
- Location: e2e\phase2.spec.ts:80:5

# Error details

```
Error: a connection is offered

expect(received).toBeTruthy()

Received: undefined
```

# Page snapshot

```yaml
- generic [ref=f4e1]:
  - link "Skip to content" [ref=f4e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=f4e3]:
    - complementary "Workspace navigation" [ref=f4e4]:
      - generic "E2E b7abdc" [ref=f4e7]
      - navigation [ref=f4e8]:
        - generic [ref=f4e9]:
          - paragraph [ref=f4e10]: Build
          - list [ref=f4e11]:
            - listitem [ref=f4e12]:
              - link "Flows" [ref=f4e13] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/flows
                - generic [aria-hidden] [ref=f4e14]: ▦
            - listitem [ref=f4e16]:
              - link "Canvas" [ref=f4e17] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/canvas
                - generic [aria-hidden] [ref=f4e18]: ⌘
            - listitem [ref=f4e20]:
              - link "Templates" [ref=f4e21] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/templates
                - generic [aria-hidden] [ref=f4e22]: ▤
        - generic [ref=f4e24]:
          - paragraph [ref=f4e25]: AI
          - list [ref=f4e26]:
            - listitem [ref=f4e27]:
              - link "Agents" [ref=f4e28] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/agents
                - generic [aria-hidden] [ref=f4e29]: ✦
            - listitem [ref=f4e31]:
              - link "Knowledge" [ref=f4e32] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/knowledge
                - generic [aria-hidden] [ref=f4e33]: ❏
        - generic [ref=f4e35]:
          - paragraph [ref=f4e36]: Observe
          - list [ref=f4e37]:
            - listitem [ref=f4e38]:
              - link "Run history" [ref=f4e39] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/runs
                - generic [aria-hidden] [ref=f4e40]: ◷
            - listitem [ref=f4e42]:
              - link "Integrations" [ref=f4e43] [cursor=pointer]:
                - /url: /w/e2e-b7abdc/integrations
                - generic [aria-hidden] [ref=f4e44]: ⬡
      - generic [ref=f4e46]:
        - link "Settings" [ref=f4e47] [cursor=pointer]:
          - /url: /w/e2e-b7abdc/settings
          - generic [aria-hidden] [ref=f4e48]: ⚙
        - button "E2E User" [ref=f4e51]:
          - generic [aria-hidden] [ref=f4e52]: EU
    - main [ref=f4e55]:
      - generic [ref=f4e56]:
        - generic [ref=f4e57]:
          - navigation "Breadcrumb" [ref=f4e58]:
            - link "Flows" [ref=f4e59] [cursor=pointer]:
              - /url: /w/e2e-b7abdc/flows
              - generic [aria-hidden] [ref=f4e60]: ←
              - text: Flows
            - generic [ref=f4e61]: /
            - generic [ref=f4e62]: Flow name
            - textbox "Flow name" [ref=f4e63]: Lead Enrichment Pipeline
          - status [ref=f4e65]: Saved
          - generic [ref=f4e66]:
            - generic [ref=f4e67]: Not published
            - generic [ref=f4e69]:
              - button "Triggers" [disabled] [ref=f4e70]
              - tooltip "Publish to activate webhook/schedule triggers"
            - generic [ref=f4e71]:
              - button "Publish" [disabled] [ref=f4e72]
              - tooltip "Fix 4 issues before publishing"
          - generic [ref=f4e73]:
            - button "⚠ 4 issues" [ref=f4e75]
            - generic [ref=f4e76]:
              - generic [ref=f4e77]:
                - button "Undo (CtrlZ)" [disabled] [ref=f4e78]: ↶
                - tooltip "Nothing to undo"
              - generic [ref=f4e79]:
                - button "Redo (Ctrl⇧Z)" [disabled] [ref=f4e80]: ↷
                - tooltip "Nothing to redo"
            - button "History" [ref=f4e81]
            - button "✦ Copilot" [ref=f4e82]
            - button "Runs CtrlJ" [ref=f4e83]:
              - text: Runs
              - generic [ref=f4e84]: CtrlJ
            - generic [ref=f4e85]:
              - button "▶ Run" [disabled] [ref=f4e86]
              - tooltip "Fix 4 issues before running"
        - generic [ref=f4e88]:
          - application "Flow canvas" [ref=f4e89]:
            - generic [ref=f4e91]:
              - generic:
                - generic:
                  - img:
                    - group "Edge from hook to enrich"
                  - img:
                    - group "Edge from enrich to score"
                  - img:
                    - group "Edge from score to isHot"
                  - img:
                    - group "Edge from isHot to sheet" [ref=f4e92] [cursor=pointer]
                  - img:
                    - group "Edge from sheet to slack"
                  - img:
                    - group "Edge from isHot to nurture" [ref=f4e95] [cursor=pointer]
                - generic:
                  - group [ref=f4e98]:
                    - generic "Form submitted — Webhook trigger" [ref=f4e99]:
                      - paragraph [ref=f4e100]:
                        - generic [ref=f4e102]: Form submitted
                      - paragraph [ref=f4e103]: TRIGGER · WEBHOOK
                      - paragraph [ref=f4e105]: Not run yet
                      - generic "Form submitted output" [ref=f4e106]
                  - group [ref=f4e107]:
                    - generic "Enrich lead — AI · Extract" [ref=f4e108]:
                      - generic "Enrich lead input" [ref=f4e109]
                      - paragraph [ref=f4e110]:
                        - generic [ref=f4e112]: Enrich lead
                      - paragraph [ref=f4e113]: AI · STRUCTURED JSON
                      - paragraph [ref=f4e115]: Not run yet
                      - generic "Enrich lead output" [ref=f4e116]
                  - group [ref=f4e117]:
                    - generic "Score lead — AI · Classify" [ref=f4e118]:
                      - generic "Score lead input" [ref=f4e119]
                      - paragraph [ref=f4e120]:
                        - generic [ref=f4e122]: Score lead
                      - paragraph [ref=f4e123]: AI · LABEL
                      - paragraph [ref=f4e125]: Not run yet
                      - generic "Score lead output" [ref=f4e126]
                  - group [ref=f4e127]:
                    - generic "Hot lead? — Condition" [ref=f4e128]:
                      - generic "Hot lead? input" [ref=f4e129]
                      - paragraph [ref=f4e130]:
                        - generic [ref=f4e132]: Hot lead?
                      - paragraph [ref=f4e133]: LOGIC · IF / ELSE
                      - paragraph [ref=f4e135]: Not run yet
                      - generic:
                        - generic "Hot lead? true branch" [ref=f4e136]
                        - generic: "true"
                      - generic:
                        - generic "Hot lead? false branch" [ref=f4e137]
                        - generic: "false"
                  - group [active] [ref=f4e138]:
                    - generic "Sheets — Add row — App action, 2 issue(s)" [ref=f4e139]:
                      - generic "Sheets — Add row input" [ref=f4e140]
                      - paragraph [ref=f4e141]:
                        - generic [ref=f4e143]: Sheets — Add row
                      - paragraph [ref=f4e144]: GOOGLE SHEETS · APPEND ROW
                      - paragraph [ref=f4e146]: Not run yet
                      - generic [aria-hidden] [ref=f4e147]: "!"
                      - generic "Sheets — Add row output" [ref=f4e148]
                  - group [ref=f4e149]:
                    - generic "Slack — Notify — App action, 2 issue(s)" [ref=f4e150]:
                      - generic "Slack — Notify input" [ref=f4e151]
                      - paragraph [ref=f4e152]:
                        - generic [ref=f4e154]: Slack — Notify
                      - paragraph [ref=f4e155]: SLACK · POST MESSAGE
                      - paragraph [ref=f4e157]: Not run yet
                      - generic [aria-hidden] [ref=f4e158]: "!"
                      - generic "Slack — Notify output" [ref=f4e159]
                  - group [ref=f4e160]:
                    - generic "Nurture — Output" [ref=f4e161]:
                      - generic "Nurture input" [ref=f4e162]
                      - paragraph [ref=f4e163]:
                        - generic [ref=f4e165]: Nurture
                      - paragraph [ref=f4e166]: OUTPUT · RESULT
                      - paragraph [ref=f4e168]: Not run yet
            - img "Mini map" [ref=f4e170]
            - link "React Flow attribution" [ref=f4e179] [cursor=pointer]:
              - /url: https://reactflow.dev/attribution
              - text: React Flow
          - button "+ Add node /" [ref=f4e182]:
            - text: + Add node
            - generic [ref=f4e183]: /
          - generic [ref=f4e184]:
            - button "Zoom out" [ref=f4e185]: −
            - generic "Zoom 64%" [ref=f4e186]: 64%
            - button "Zoom in" [ref=f4e187]: +
            - button "Fit" [ref=f4e188]
          - complementary [ref=f4e189]:
            - generic [ref=f4e190]:
              - generic [ref=f4e191]:
                - heading "Sheets — Add row" [level=2] [ref=f4e192]:
                  - generic [aria-hidden] [ref=f4e193]: ⬡
                - paragraph [ref=f4e195]: integration · sheet
              - button "Close drawer (Esc)" [ref=f4e196]: ✕
            - tablist "Node panels" [ref=f4e197]:
              - tab "configure" [selected] [ref=f4e198]
              - tab "test" [ref=f4e199]
              - tab "logs" [ref=f4e200]
            - tabpanel "configure" [ref=f4e201]:
              - group [ref=f4e202]:
                - list "Issues" [ref=f4e203]:
                  - listitem [ref=f4e204]: "⚠ Sheets — Add row: choose a connection"
                  - listitem [ref=f4e205]: "⚠ Sheets — Add row: finish setup — replace REPLACE_WITH_SPREADSHEET_ID"
                - generic [ref=f4e206]:
                  - generic [ref=f4e207]: Name
                  - textbox "Name" [ref=f4e208]: Sheets — Add row
                - generic [ref=f4e209]:
                  - generic [ref=f4e210]: App
                  - combobox "App" [ref=f4e211]:
                    - option "Choose an app"
                    - option "Google Sheets" [selected]
                    - option "Gmail"
                    - option "Slack"
                    - option "HubSpot"
                    - option "Zendesk"
                    - option "Airtable"
                    - option "Snowflake"
                    - option "GitHub"
                    - option "Stripe"
                    - option "Notion"
                    - option "PostgreSQL"
                    - option "Linear"
                - generic [ref=f4e212]:
                  - generic [ref=f4e213]: Action
                  - combobox "Action" [ref=f4e214]:
                    - option "Choose an action"
                    - option "Read range · Read-only"
                    - option "Append row · Not idempotent" [selected]
                - paragraph [ref=f4e215]: Append a row to a range. The run's idempotency key is written as the last cell of the row in a column documented as "flowline_id".
                - generic [ref=f4e216]:
                  - generic [ref=f4e217]: Connection
                  - combobox "Connection" [ref=f4e218]:
                    - option "Choose a connection" [selected]
                    - option "Google Sheets (alice@flowline.test)"
                  - paragraph [ref=f4e219]:
                    - link "Manage connections" [ref=f4e220] [cursor=pointer]:
                      - /url: /w/e2e-b7abdc/integrations
                      - text: Manage connections
                      - generic [aria-hidden] [ref=f4e221]: →
                - generic [ref=f4e222]:
                  - generic [ref=f4e223]: Input mapping (JSONata → object)
                  - textbox "Input mapping (JSONata → object)" [ref=f4e224]: "{ \"spreadsheetId\": \"REPLACE_WITH_SPREADSHEET_ID\", \"range\": \"Leads!A1\", \"row\": [$steps.hook.body.lead.name, $steps.hook.body.lead.email, $steps.enrich.company, $string($steps.enrich.headcount), $steps.score.label] }"
                  - paragraph [ref=f4e225]:
                    - text: "Required:"
                    - code [ref=f4e226]: spreadsheetId
                    - code [ref=f4e227]: range
                    - code [ref=f4e228]: row
                    - text: . Use
                    - code [ref=f4e229]: $steps.<id>
                    - text: for upstream data.
                - button "Reset to template" [ref=f4e230]
                - generic [ref=f4e231]:
                  - checkbox "Require human approval before running" [ref=f4e232]
                  - generic [ref=f4e233]: Require human approval before running
                - generic [ref=f4e234]:
                  - generic [ref=f4e235]: Attempts
                  - spinbutton "Attempts" [ref=f4e236]: "3"
                  - paragraph [ref=f4e237]: Lost responses are verified or sent for review — never blindly retried.
                - paragraph [ref=f4e238]: Calls an action on a connected app (Sheets, Slack, HubSpot…) using a workspace connection.
            - generic [ref=f4e239]:
              - button "Duplicate CtrlD" [ref=f4e240]:
                - text: Duplicate
                - generic [ref=f4e241]: CtrlD
              - button "Delete Del" [ref=f4e242]:
                - text: Delete
                - generic [ref=f4e243]: Del
  - alert [ref=f4e244]
```

# Test source

```ts
  1   | import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
  2   | import { randomUUID } from "node:crypto";
  3   | import { connectAiApi, expectSaved, setupUser } from "./helpers";
  4   | 
  5   | /**
  6   |  * Phase 2 journeys through the real UI. Only the provider boundary is doubled:
  7   |  * SaaS APIs → e2e/fakes/provider-server.ts (:4010), AI → e2e/fakes/ai-server.ts (:4011, OpenAI-compatible double).
  8   |  * Every test uses unique spreadsheet/channel ids so parallel workers never share fake state.
  9   |  */
  10  | const FAKE = process.env.FLOWLINE_PROVIDER_OVERRIDE ?? "http://127.0.0.1:4010";
  11  | 
  12  | async function fault(req: APIRequestContext, provider: string, pathPattern: string, mode: "500" | "429" | "timeout", times: number) {
  13  |   const r = await req.post(`${FAKE}/__fake/fault`, { data: { provider, pathPattern, mode, times } });
  14  |   expect(r.ok()).toBeTruthy();
  15  | }
  16  | async function sheetRows(req: APIRequestContext, id: string): Promise<unknown[][]> {
  17  |   const st = (await (await req.get(`${FAKE}/__fake/state/google_sheets`)).json()) as { sheets: Record<string, unknown[][]> };
  18  |   return st.sheets[id] ?? [];
  19  | }
  20  | async function slackMessages(req: APIRequestContext, channel: string): Promise<{ text: string }[]> {
  21  |   const st = (await (await req.get(`${FAKE}/__fake/state/slack`)).json()) as { messages: { channel: string; text: string }[] };
  22  |   return st.messages.filter((m) => m.channel === channel);
  23  | }
  24  | async function latestRuns(req: APIRequestContext, flowId: string) {
  25  |   return (await (await req.get(`/api/flows/${flowId}/runs`)).json()).runs as { id: string; number: number; status: string }[];
  26  | }
  27  | async function stepStatuses(req: APIRequestContext, runId: string) {
  28  |   const run = (await (await req.get(`/api/runs/${runId}`)).json()).run as { steps: { nodeId: string; status: string }[] };
  29  |   return Object.fromEntries(run.steps.map((s) => [s.nodeId, s.status]));
  30  | }
  31  | 
  32  | /** Connect an OAuth app through the UI: dialog → fake consent → callback → back on Integrations. */
  33  | async function connectOAuth(page: Page, slug: string, name: string, provider: string) {
  34  |   await page.goto(`/w/${slug}/integrations`);
  35  |   await page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) }).getByRole("button", { name: "Connect" }).click();
  36  |   const dialog = page.getByRole("dialog", { name: `Connect ${name}` });
  37  |   await dialog.getByRole("button", { name: `Continue to ${name}` }).click();
  38  |   await expect(page).toHaveURL(new RegExp(`/w/${slug}/integrations`));
  39  |   await expect(page.getByTestId(`connection-${provider}`)).toBeVisible();
  40  | }
  41  | 
  42  | async function openNode(page: Page, id: string) {
  43  |   await page.locator(`.react-flow__node[data-id="${id}"]`).click();
  44  |   const drawer = page.getByTestId("node-drawer");
  45  |   await expect(drawer).toBeVisible();
  46  |   return drawer;
  47  | }
  48  | /** Choose the workspace's (only) connection for this action node. */
  49  | async function pickConnection(drawer: Locator) {
  50  |   const select = drawer.getByLabel("Connection");
  51  |   const label = (await select.locator("option").allTextContents()).find((o) => o && !o.startsWith("Choose") && !o.startsWith("No "));
> 52  |   expect(label, "a connection is offered").toBeTruthy();
      |                                            ^ Error: a connection is offered
  53  |   await select.selectOption({ label: label! });
  54  | }
  55  | async function closeDrawer(page: Page) {
  56  |   await page.keyboard.press("Escape");
  57  |   await page.keyboard.press("Escape");
  58  | }
  59  | 
  60  | async function saveGraph(req: APIRequestContext, flowId: string, graph: unknown) {
  61  |   const res = await req.put(`/api/flows/${flowId}`, { data: { baseRevision: 1, graph } });
  62  |   expect(res.ok(), await res.text()).toBeTruthy();
  63  | }
  64  | const pos = (i: number) => ({ x: 300 * i, y: 120 });
  65  | const manual = { id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: '{ "name": "Ada" }' } } };
  66  | const out = (i: number) => ({ id: "o", type: "output", position: pos(i), data: { label: "Done", config: { key: "done", expression: "" } } });
  67  | const act = (id: string, label: string, i: number, actionId: string, connectionId: string, inputMapping: string, extra: Record<string, unknown> = {}) => ({
  68  |   id,
  69  |   type: "integration.action",
  70  |   position: pos(i),
  71  |   data: { label, config: { actionId, connectionId, inputMapping, requireApproval: false, retry: { maxAttempts: 3 }, ...extra } },
  72  | });
  73  | const line = (...ids: string[]) => ids.slice(1).map((id, i) => ({ id: `e${i}`, source: ids[i]!, target: id, sourceHandle: null }));
  74  | async function createConn(req: APIRequestContext, wid: string, provider: string) {
  75  |   const res = await req.post(`/api/workspaces/${wid}/connections`, { data: { provider, label: `${provider} (e2e)`, fields: { token: "test-token" } } });
  76  |   expect(res.ok(), await res.text()).toBeTruthy();
  77  |   return (await res.json()).connection.id as string;
  78  | }
  79  | 
  80  | test("template journey: connect apps via OAuth, finish setup in the canvas, Sheets fails, re-run from that step without duplicates", async ({ page }) => {
  81  |   test.setTimeout(150_000);
  82  |   const { workspace } = await setupUser(page);
  83  |   await connectAiApi(page.request, workspace.id); // the template's AI steps run on the workspace AI connection
  84  |   const sheetId = `sheet-e2e-${randomUUID().slice(0, 8)}`;
  85  |   const channel = `C_E2E_${randomUUID().slice(0, 8)}`;
  86  | 
  87  |   await connectOAuth(page, workspace.slug, "Google Sheets", "google_sheets");
  88  |   await connectOAuth(page, workspace.slug, "Slack", "slack");
  89  | 
  90  |   // The template shows real requirement status, then creates an independent flow.
  91  |   await page.goto(`/w/${workspace.slug}/templates`);
  92  |   const card = page.getByTestId("template-lead-enrichment");
  93  |   await expect(card.getByRole("list", { name: "Requirements" })).not.toContainText("Not connected");
  94  |   await card.getByRole("button", { name: "Use template" }).click();
  95  |   await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  96  |   const flowId = page.url().split("/").pop()!;
  97  |   const run = page.getByRole("button", { name: "▶ Run" });
  98  |   await expect(run).toHaveAttribute("aria-disabled", "true"); // setup required
  99  | 
  100 |   // Finish setup in the node drawers: choose connections and edit the mappings.
  101 |   let drawer = await openNode(page, "sheet");
  102 |   await pickConnection(drawer);
  103 |   await drawer
  104 |     .getByLabel("Input mapping (JSONata → object)")
  105 |     .fill(`{ "spreadsheetId": "${sheetId}", "range": "Leads!A1", "row": [$steps.hook.body.lead.name, $steps.enrich.company, $steps.score.label] }`);
  106 |   await closeDrawer(page);
  107 |   drawer = await openNode(page, "slack");
  108 |   await pickConnection(drawer);
  109 |   await drawer.getByLabel("Input mapping (JSONata → object)").fill(`{ "channel": "${channel}", "text": "Hot lead: " & $steps.hook.body.lead.name }`);
  110 |   await closeDrawer(page);
  111 |   await expectSaved(page);
  112 |   await expect(run).not.toHaveAttribute("aria-disabled", "true");
  113 | 
  114 |   // Sheets returns 5xx for every bounded retry of this step.
  115 |   await fault(page.request, "google_sheets", sheetId, "500", 3);
  116 |   await run.click();
  117 |   const dock = page.getByTestId("run-dock");
  118 |   await expect(dock.getByText("FAILED").first()).toBeVisible({ timeout: 45_000 });
  119 |   expect(await sheetRows(page.request, sheetId)).toHaveLength(0);
  120 |   expect(await slackMessages(page.request, channel)).toHaveLength(0);
  121 |   const [first] = await latestRuns(page.request, flowId);
  122 |   expect(await stepStatuses(page.request, first!.id)).toMatchObject({ hook: "succeeded", enrich: "succeeded", score: "succeeded", sheet: "failed" });
  123 | 
  124 |   // Re-run from the failed step through the inspector with a preview.
  125 |   await dock.getByRole("link", { name: /Open in inspector/ }).click();
  126 |   await page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Sheets — Add row/ }).click();
  127 |   await page.getByTestId("step-panel").getByRole("button", { name: /Re-run from this step/ }).click();
  128 |   const dialog = page.getByRole("dialog", { name: /Re-run #1 from/ });
  129 |   const preview = dialog.getByTestId("rerun-preview");
  130 |   await expect(preview).toContainText("Sheets — Add row");
  131 |   await expect(preview).toContainText(/Reused from #1 · 4/);
  132 |   await expect(preview).toContainText("Enrich lead");
  133 |   await dialog.getByRole("button", { name: /^Re-run \d+ steps?$/ }).click();
  134 |   await expect(page.getByText(/Re-running as #2/)).toBeVisible();
  135 |   await expect.poll(async () => (await latestRuns(page.request, flowId))[0]!.status, { timeout: 30_000 }).toBe("succeeded");
  136 | 
  137 |   const [second] = await latestRuns(page.request, flowId);
  138 |   expect(await stepStatuses(page.request, second!.id)).toMatchObject({ hook: "reused", enrich: "reused", score: "reused", isHot: "reused", sheet: "succeeded", slack: "succeeded" });
  139 |   expect(await sheetRows(page.request, sheetId)).toHaveLength(1);
  140 |   expect(await slackMessages(page.request, channel)).toHaveLength(1);
  141 |   // AI was billed once per AI step: the re-run reused those outputs.
  142 |   const usage = (await (await page.request.get(`/api/workspaces/${workspace.id}/usage`)).json()) as { rows: { kind: string; events: number }[] };
  143 |   expect(usage.rows.filter((r) => r.kind === "ai").reduce((n, r) => n + r.events, 0)).toBe(2);
  144 | });
  145 | 
  146 | test("double-clicked Run starts one run, and Cancel stops it mid-request", async ({ page }) => {
  147 |   const { workspace, flowId } = await setupUser(page, { template: "blank" });
  148 |   const sheetId = `sheet-e2e-${randomUUID().slice(0, 8)}`;
  149 |   const conn = await createConn(page.request, workspace.id, "google_sheets");
  150 |   await saveGraph(page.request, flowId!, {
  151 |     nodes: [manual, act("sheet", "Add row", 1, "google_sheets.append_row", conn, `{ "spreadsheetId": "${sheetId}", "range": "A1", "row": [name] }`), out(2)],
  152 |     edges: line("t", "sheet", "o"),
```