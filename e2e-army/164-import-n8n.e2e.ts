// Issue #164: a signed-in member imports an n8n workflow JSON (webhook -> function -> HTTP) from the flows page and gets an
// editable flow with the supported steps; an unsupported n8n node becomes a labelled placeholder that blocks running until
// it is replaced. Invalid JSON is refused and creates no flow.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const N8N_WORKFLOW = JSON.stringify({
  name: "Army lead intake",
  nodes: [
    { name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 0], parameters: { path: "lead" } },
    { name: "Shape", type: "n8n-nodes-base.function", typeVersion: 1, position: [240, 0], parameters: { functionCode: "return items;" } },
    { name: "Notify", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [480, 0], parameters: { requestMethod: "POST", url: "https://example.invalid/hook" } },
    { name: "Filter", type: "n8n-nodes-base.set", typeVersion: 1, position: [720, 0], parameters: {} },
  ],
  connections: {
    Webhook: { main: [[{ node: "Shape", type: "main", index: 0 }]] },
    Shape: { main: [[{ node: "Notify", type: "main", index: 0 }]] },
    Notify: { main: [[{ node: "Filter", type: "main", index: 0 }]] },
  },
});

test(
  "@issue-164 AC1: importing an n8n workflow creates an editable flow with a placeholder for the unsupported node",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("paste {json} into the n8n workflow box and click Import", { params: { json: N8N_WORKFLOW } });
    await agent.assert("the flow editor opens and shows the steps named Webhook, Shape and Notify");
    await expect(screen.getByText("Webhook", { exact: true }).first()).toBeVisible();
    await expect(screen.getByText("Shape", { exact: true }).first()).toBeVisible();
    await expect(screen.getByText("Notify", { exact: true }).first()).toBeVisible();
    await agent.assert("a step labelled Unsupported n8n node: n8n-nodes-base.set is shown and says to replace it");
    await expect(screen.getByText("Unsupported n8n node: n8n-nodes-base.set").first()).toBeVisible();
  },
);

test(
  "@issue-164 AC2: pasting text that is not JSON is refused and no flow is created",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("paste {text} into the n8n workflow box and click Import", { params: { text: "{ not json" } });
    await agent.assert("an error says the file is not a valid n8n workflow and the flow list did not change");
    await expect(screen.getByRole("alert").first()).toBeVisible();
  },
);

test(
  "@issue-164 AC3: the import dialog renders correctly in Arabic (RTL)",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    await app.open("/ar");
    await agent.act("افتح صفحة مسارات العمل من التنقل");
    await agent.act("انقر على استيراد من n8n");
    await agent.assert("يظهر حوار الاستيراد بالعربية مع اتجاه RTL");
    await expect(screen.getByText("استيراد مسار عمل من n8n")).toBeVisible();
    await expect(screen.getByText("الصق JSON لمسار العمل المُصدَّر من n8n. تُستورد عقد الويب هوك والكود وطلب HTTP، وتصبح العقد الأخرى عناصر نائبة تستبدلها قبل تشغيل المسار.")).toBeVisible();
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe("rtl");
  },
);

test(
  "@issue-164 AC4: the import dialog has a file upload button for .json files",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.assert("the dialog shows an Upload .json file button");
    await expect(screen.getByRole("button", { name: "Upload .json file" })).toBeVisible();
  },
);

test(
  "@issue-164 AC5: uploading a valid .json file parses and populates the workflow box",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("upload {file} as the n8n workflow", { params: { file: N8N_WORKFLOW } });
    await agent.assert("the workflow JSON appears in the text area");
    const textarea = screen.getByRole("textbox", { name: "n8n workflow JSON" });
    await expect(textarea).toHaveValue(/Webhook/);
    await expect(textarea).toHaveValue(/Shape/);
  },
);

test(
  "@issue-164 AC6: uploading an invalid .json file shows an error",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("upload {file} as the n8n workflow", { params: { file: "{ not json" } });
    await agent.assert("an error says the file is not valid JSON");
    await expect(screen.getByRole("alert").first()).toBeVisible();
  },
);

test(
  "@issue-164 AC7: uploading a valid JSON that is not an n8n workflow shows an error",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("upload {file} as the n8n workflow", { params: { file: '{"foo": "bar"}' } });
    await agent.assert("an error says the file is not a valid n8n workflow");
    await expect(screen.getByRole("alert").first()).toBeVisible();
  },
);
