# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase3.spec.ts >> API keys: created with a one-time reveal, work against /api/v1, stop working when revoked
- Location: e2e/phase3.spec.ts:102:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.goto: Test timeout of 60000ms exceeded.
Call log:
  - navigating to "http://localhost:3100/w/e2e-8310b2/settings?tab=keys", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2]:
    - /url: "#main"
  - generic [ref=e3]:
    - complementary "Workspace navigation" [ref=e4]:
      - generic "E2E 8310b2" [ref=e7]
      - navigation [ref=e8]:
        - generic [ref=e9]:
          - paragraph [ref=e10]: Build
          - list [ref=e11]:
            - listitem [ref=e12]:
              - link "Flows" [ref=e13]:
                - /url: /w/e2e-8310b2/flows
                - generic [aria-hidden] [ref=e14]: ▦
            - listitem [ref=e16]:
              - link "Canvas" [ref=e17]:
                - /url: /w/e2e-8310b2/canvas
                - generic [aria-hidden] [ref=e18]: ⌘
            - listitem [ref=e20]:
              - link "Templates" [ref=e21]:
                - /url: /w/e2e-8310b2/templates
                - generic [aria-hidden] [ref=e22]: ▤
        - generic [ref=e24]:
          - paragraph [ref=e25]: AI
          - list [ref=e26]:
            - listitem [ref=e27]:
              - link "Agents" [ref=e28]:
                - /url: /w/e2e-8310b2/agents
                - generic [aria-hidden] [ref=e29]: ✦
            - listitem [ref=e31]:
              - link "Knowledge" [ref=e32]:
                - /url: /w/e2e-8310b2/knowledge
                - generic [aria-hidden] [ref=e33]: ❏
        - generic [ref=e35]:
          - paragraph [ref=e36]: Observe
          - list [ref=e37]:
            - listitem [ref=e38]:
              - link "Run history" [ref=e39]:
                - /url: /w/e2e-8310b2/runs
                - generic [aria-hidden] [ref=e40]: ◷
            - listitem [ref=e42]:
              - link "Integrations" [ref=e43]:
                - /url: /w/e2e-8310b2/integrations
                - generic [aria-hidden] [ref=e44]: ⬡
      - generic [ref=e46]:
        - link "Settings" [ref=e47]:
          - /url: /w/e2e-8310b2/settings
          - generic [aria-hidden] [ref=e48]: ⚙
        - button "E2E User" [ref=e51]:
          - generic [aria-hidden] [ref=e52]: EU
    - main [ref=e55]:
      - generic [ref=e56]:
        - heading "Settings" [level=1] [ref=e59]
        - generic [ref=e60]:
          - navigation "Settings sections" [ref=e61]:
            - button "Members" [ref=e62]
            - button "General" [ref=e63]
            - button "AI Providers" [ref=e64]
            - button "API keys" [ref=e65]
            - button "Plan & billing" [ref=e66]
            - button "Usage & limits" [ref=e67]
            - button "Audit log" [ref=e68]
            - button "SSO" [ref=e69]
            - button "OAuth apps" [ref=e70]
          - generic [ref=e72]:
            - generic [ref=e73]:
              - heading "API keys" [level=2] [ref=e74]
              - paragraph [ref=e75]:
                - text: Start runs of your flows from other systems.
                - strong [ref=e76]: Live
                - text: keys run published versions only;
                - strong [ref=e77]: test
                - text: keys run a snapshot of the current draft. Keys act with their creator's access and stop working if it's reduced.
            - generic [ref=e80]:
              - heading "Create a key" [level=3] [ref=e81]
              - generic [ref=e82]:
                - generic [ref=e83]:
                  - generic [ref=e84]:
                    - generic [ref=e85]: Name
                    - textbox "Name" [ref=e86]:
                      - /placeholder: e.g. CRM sync
                  - generic [ref=e87]:
                    - generic [ref=e88]: Mode
                    - combobox "Mode" [ref=e89]:
                      - option "Test" [selected]
                      - option "Live"
                  - generic [ref=e90]:
                    - generic [ref=e91]: Expires
                    - combobox "Expires" [ref=e92]:
                      - option "in 30 days"
                      - option "in 90 days" [selected]
                      - option "in 1 year"
                      - option "never"
                - group "Scopes" [ref=e93]
                - generic [ref=e96]:
                  - button "Create key" [disabled] [ref=e97]
                  - tooltip "Name the key"
```

# Test source

```ts
  4   | import { connectAiApi, setupUser, signUpVerified, uniqueEmail } from "./helpers";
  5   | 
  6   | /**
  7   |  * Phase 3 journeys through the real UI. Provider boundary only is doubled (fake SaaS :4010, fake AI :4011
  8   |  * incl. its Copilot/agent modes, fake Stripe checkout). Every test uses its own users and workspaces.
  9   |  */
  10  | const FAKE = process.env.FLOWLINE_PROVIDER_OVERRIDE ?? "http://127.0.0.1:4010";
  11  | 
  12  | async function newUserContext(browser: Browser, email = uniqueEmail("p3")) {
  13  |   const ctx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL }, storageState: EN_STATE });
  14  |   const page = await ctx.newPage();
  15  |   await signUpVerified(page.request, email, "Invitee");
  16  |   return { ctx, page, email };
  17  | }
  18  | async function saveGraph(req: APIRequestContext, flowId: string, graph: unknown) {
  19  |   const res = await req.put(`/api/flows/${flowId}`, { data: { baseRevision: 1, graph } });
  20  |   expect(res.ok(), await res.text()).toBeTruthy();
  21  | }
  22  | const pos = (i: number) => ({ x: 300 * i, y: 120 });
  23  | const manual = (payload = '{ "name": "Ada" }') => ({ id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: payload } } });
  24  | const out = (i: number) => ({ id: "o", type: "output", position: pos(i), data: { label: "Done", config: { key: "done", expression: "" } } });
  25  | const line = (...ids: string[]) => ids.slice(1).map((id, i) => ({ id: `e${i}`, source: ids[i]!, target: id, sourceHandle: null }));
  26  | 
  27  | async function slackApprovalFlow(page: Page, workspaceId: string, channel: string) {
  28  |   const conn = await page.request.post(`/api/workspaces/${workspaceId}/connections`, { data: { provider: "slack", label: "Slack (e2e)", fields: { token: "test-token" } } });
  29  |   const connId = (await conn.json()).connection.id as string;
  30  |   const flowId = (await (await page.request.post(`/api/workspaces/${workspaceId}/flows`, { data: { name: "Needs approval" } })).json()).flow.id as string;
  31  |   await saveGraph(page.request, flowId, {
  32  |     nodes: [
  33  |       manual(),
  34  |       { id: "post", type: "integration.action", position: pos(1), data: { label: "Post to Slack", config: { actionId: "slack.post_message", connectionId: connId, inputMapping: `{ "channel": "${channel}", "text": "Hi " & name }`, requireApproval: true, retry: { maxAttempts: 1 } } } },
  35  |       out(2),
  36  |     ],
  37  |     edges: line("t", "post", "o"),
  38  |   });
  39  |   return flowId;
  40  | }
  41  | 
  42  | test("members: invite link → accept; a VIEWER can see but not approve (UI + API); promotion allows it; removal revokes access", { tag: "@critical" }, async ({ page, browser }) => {
  43  |   test.setTimeout(150_000);
  44  |   const { workspace } = await setupUser(page);
  45  |   const invitee = uniqueEmail("viewer");
  46  |   await page.goto(`/w/${workspace.slug}/settings`);
  47  |   await page.getByLabel("Email").fill(invitee);
  48  |   await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  49  |   await page.getByRole("button", { name: "Create invite link" }).click();
  50  |   const link = (await page.getByTestId("invite-link").textContent())!.trim();
  51  |   expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
  52  | 
  53  |   // The viewer joins through the link.
  54  |   const v = await newUserContext(browser, invitee);
  55  |   await v.page.goto(new URL(link).pathname);
  56  |   await expect(v.page.getByText(/invited to/)).toContainText(/as viewer/i);
  57  |   await v.page.getByRole("button", { name: "Accept invitation" }).click();
  58  |   await expect(v.page).toHaveURL(new RegExp(`/w/${workspace.slug}/flows`));
  59  | 
  60  |   // Owner triggers an approval-gated action.
  61  |   const channel = `C_P3_${randomUUID().slice(0, 8)}`;
  62  |   const flowId = await slackApprovalFlow(page, workspace.id, channel);
  63  |   const run = await page.request.post(`/api/flows/${flowId}/runs`, { data: {} });
  64  |   const runId = (await run.json()).run.id as string;
  65  |   await expect.poll(async () => (await (await page.request.get(`/api/runs/${runId}`)).json()).run.status, { timeout: 20_000 }).toBe("waiting_approval");
  66  | 
  67  |   // The viewer sees the request in the inspector, but can't decide it — in the UI or via the API.
  68  |   await v.page.goto(`/w/${workspace.slug}/runs?run=${runId}`);
  69  |   await v.page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Post to Slack/ }).click();
  70  |   const box = v.page.getByTestId("decision-box");
  71  |   await expect(box).toContainText(channel);
  72  |   const approve = box.getByRole("button", { name: "Approve" });
  73  |   await expect(approve).toHaveAttribute("aria-disabled", "true");
  74  |   await expect(approve).toHaveAccessibleDescription(/Only workspace owners and editors/);
  75  |   const approvals = (await (await page.request.get(`/api/workspaces/${workspace.id}/approvals`)).json()).approvals as { id: string }[];
  76  |   const direct = await v.page.request.post(`/api/approvals/${approvals[0]!.id}/decide`, { data: { decision: "approve" } });
  77  |   expect(direct.status()).toBe(403);
  78  |   expect((await (await page.request.get(`/api/runs/${runId}`)).json()).run.status).toBe("waiting_approval");
  79  | 
  80  |   // Promote to editor → now allowed.
  81  |   await page.goto(`/w/${workspace.slug}/settings`);
  82  |   await page.getByLabel(`Role of ${invitee}`).selectOption("editor");
  83  |   await expect(page.getByRole("status").filter({ hasText: "Role updated" })).toBeVisible();
  84  |   await v.page.reload();
  85  |   await v.page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Post to Slack/ }).click();
  86  |   await v.page.getByTestId("decision-box").getByRole("button", { name: "Approve" }).click();
  87  |   await expect.poll(async () => (await (await page.request.get(`/api/runs/${runId}`)).json()).run.status, { timeout: 20_000 }).toBe("succeeded");
  88  | 
  89  |   // Removal takes effect on the next request.
  90  |   await page.getByTestId(`member-${invitee}`).getByRole("button", { name: "Remove" }).click();
  91  |   await page.getByTestId(`member-${invitee}`).getByRole("button", { name: "Confirm remove" }).click();
  92  |   await expect(page.getByTestId(`member-${invitee}`)).toHaveCount(0);
  93  |   expect((await v.page.request.get(`/api/workspaces/${workspace.id}/flows`)).status()).toBe(404);
  94  |   await v.ctx.close();
  95  | 
  96  |   // Audit trail.
  97  |   await page.getByRole("button", { name: "Audit log" }).click();
  98  |   const audit = page.getByRole("list", { name: "Audit events" });
  99  |   for (const a of ["member.invited", "member.joined", "approval.decided", "member.role_changed", "member.removed"]) await expect(audit).toContainText(a);
  100 | });
  101 | 
  102 | test("API keys: created with a one-time reveal, work against /api/v1, stop working when revoked", { tag: "@critical" }, async ({ page }) => {
  103 |   const { workspace } = await setupUser(page, { template: "lead-qualifier" });
> 104 |   await page.goto(`/w/${workspace.slug}/settings?tab=keys`);
      |              ^ Error: page.goto: Test timeout of 60000ms exceeded.
  105 |   await page.getByLabel("Name").fill("CI");
  106 |   await page.getByRole("button", { name: "Create key" }).click();
  107 |   const key = (await page.getByTestId("revealed-key").textContent())!.trim();
  108 |   expect(key).toMatch(/^fl_test_[a-z0-9]{8}_/);
  109 |   const call = () => page.request.get("/api/v1/flows", { headers: { authorization: `Bearer ${key}` } });
  110 |   // Needs flows:read — the default scopes are runs:write + runs:read.
  111 |   expect((await call()).status()).toBe(403);
  112 |   const runs = await page.request.post(`/api/v1/flows/${(await (await page.request.get(`/api/workspaces/${workspace.id}/flows`)).json()).flows[0].id}/runs`, { headers: { authorization: `Bearer ${key}` }, data: { input: {} } });
  113 |   expect(runs.status()).toBe(202);
  114 |   await page.getByRole("button", { name: "I've stored it" }).click();
  115 |   await expect(page.getByTestId("revealed-key")).toHaveCount(0);
  116 |   await page.reload();
  117 |   await expect(page.getByText(key)).toHaveCount(0); // never shown again
  118 |   await page.getByTestId("apikey-CI").getByRole("button", { name: "Revoke" }).click();
  119 |   await page.getByTestId("apikey-CI").getByRole("button", { name: "Confirm revoke" }).click();
  120 |   await expect(page.getByTestId("apikey-CI")).toContainText("revoked");
  121 |   const after = await page.request.post(`/api/v1/flows/${(await (await page.request.get(`/api/workspaces/${workspace.id}/flows`)).json()).flows[0].id}/runs`, { headers: { authorization: `Bearer ${key}` }, data: {} });
  122 |   expect(after.status()).toBe(401);
  123 | });
  124 | 
  125 | test("knowledge + agent: upload, index, cite; ASK tool pauses for approval and runs the published workflow once", { tag: "@critical" }, async ({ page }) => {
  126 |   test.setTimeout(150_000);
  127 |   const { workspace } = await setupUser(page);
  128 |   await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
  129 |   // A published workflow the agent may run.
  130 |   const flowId = (await (await page.request.post(`/api/workspaces/${workspace.id}/flows`, { data: { name: "Doubler" } })).json()).flow.id as string;
  131 |   await saveGraph(page.request, flowId, {
  132 |     nodes: [manual('{ "n": 1 }'), { id: "x", type: "transform.json", position: pos(1), data: { label: "Double", config: { expression: '{ "v": n * 2 }' } } }, out(2)],
  133 |     edges: line("t", "x", "o"),
  134 |   });
  135 |   expect((await page.request.post(`/api/flows/${flowId}/publish`)).status()).toBe(201);
  136 | 
  137 |   await page.goto(`/w/${workspace.slug}/knowledge`);
  138 |   await page.getByLabel("Title").fill("Refund policy");
  139 |   await page.getByLabel("Text").fill("Refunds are available within 30 days of purchase.");
  140 |   await page.getByRole("button", { name: "Add text" }).click();
  141 |   await expect(page.getByTestId("source-Refund policy")).toContainText("ready", { timeout: 20_000 });
  142 | 
  143 |   await page.goto(`/w/${workspace.slug}/agents`);
  144 |   await page.getByRole("link", { name: "New agent" }).first().click();
  145 |   await page.getByLabel("Name").fill("Support bot");
  146 |   await page.getByLabel("Instructions").fill("Answer from knowledge; run the Doubler when asked.");
  147 |   await page.getByRole("list", { name: "Knowledge sources" }).getByLabel(/Refund policy/).check();
  148 |   await page.getByRole("list", { name: "Workflow tools" }).getByLabel(/Doubler/).check(); // defaults to ASK
  149 |   await page.getByRole("button", { name: "Create agent" }).click();
  150 |   await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}$/);
  151 | 
  152 |   await page.getByLabel("Message the agent").fill("How many days do refunds take?");
  153 |   await page.getByRole("button", { name: "Send" }).click();
  154 |   const answered = page.getByTestId("agent-turn-succeeded").first();
  155 |   await expect(answered).toContainText("30 days", { timeout: 30_000 });
  156 |   await expect(answered).toContainText("Refund policy");
  157 | 
  158 |   await page.getByLabel("Message the agent").fill('run Doubler with {"n": 21}');
  159 |   await page.getByRole("button", { name: "Send" }).click();
  160 |   const approval = page.getByTestId("agent-approval");
  161 |   await expect(approval).toContainText('"n": 21', { timeout: 30_000 });
  162 |   await approval.getByRole("button", { name: "Approve" }).click();
  163 |   await expect(page.getByTestId("agent-turn-succeeded")).toHaveCount(2, { timeout: 30_000 });
  164 |   await expect(page.getByTestId("agent-turn-succeeded").nth(1)).toContainText('"v":42');
  165 |   const runs = (await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs as unknown[];
  166 |   expect(runs).toHaveLength(1); // ran exactly once, through the engine
  167 | });
  168 | 
  169 | test.describe("Copilot", () => {
  170 |   async function openCopilot(page: Page, slug: string, flowId: string) {
  171 |     await page.goto(`/w/${slug}/flows/${flowId}`);
  172 |     await page.getByRole("button", { name: "✦ Copilot" }).click();
  173 |     return page.getByRole("dialog", { name: "Copilot" });
  174 |   }
  175 |   const ask = async (panel: ReturnType<Page["getByRole"]>, text: string) => {
  176 |     await panel.getByLabel("What should this workflow do?").fill(text);
  177 |     await panel.getByRole("button", { name: "Propose" }).click();
  178 |     return panel.getByTestId("copilot-proposal");
  179 |   };
  180 | 
  181 |   test("valid generation with a missing credential → approve → saved draft, nothing ran", { tag: "@critical" }, async ({ page }) => {
  182 |     const { workspace } = await setupUser(page);
  183 |     await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
  184 |     await page.goto(`/w/${workspace.slug}/flows`);
  185 |     const flowCount = async () => ((await (await page.request.get(`/api/workspaces/${workspace.id}/flows`)).json()).flows as unknown[]).length;
  186 |     await page.getByRole("button", { name: "✦ Create with Copilot" }).click();
  187 |     const panel = page.getByRole("dialog", { name: "Copilot" });
  188 |     // Abandoned or rejected attempts leave no empty draft behind (Codex CX3Q-05).
  189 |     let p = await ask(panel, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
  190 |     await expect(p).toContainText("Proposal — review");
  191 |     await panel.getByRole("button", { name: "Reject" }).click();
  192 |     await expect(p).toContainText("rejected");
  193 |     expect(await flowCount()).toBe(0);
  194 | 
  195 |     p = await ask(panel, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
  196 |     await expect(p.getByRole("list", { name: "Setup needed" })).toContainText(/Connect Gmail|Connect PostgreSQL/);
  197 |     await expect(p.getByLabel("Proposed changes")).toContainText("+ Gmail — Email leadership");
  198 |     await panel.getByRole("button", { name: "Approve & create draft" }).click();
  199 |     await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  200 |     await expect(page.locator(".react-flow__node")).toHaveCount(5, { timeout: 15_000 });
  201 |     const flowId = page.url().split("/").pop()!;
  202 |     expect(await flowCount()).toBe(1);
  203 |     expect(((await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs as unknown[]).length).toBe(0);
  204 |   });
```