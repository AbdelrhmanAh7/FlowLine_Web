import { expect, test, type Page } from "@playwright/test";
import { EN_STATE } from "../playwright.config";
import { setupUser } from "./helpers";

/**
 * Company Builder journey (DETERMINISTIC_TEST mode — no AI key, no CLI, no external account):
 * new session → adaptive interview → edit/confirm profile → plan preview → create drafts → sample trial →
 * inspect result → approve a permitted test action → activation → inspect history.
 */

async function answerSingle(page: Page, questionId: string, label: string | RegExp) {
  const q = page.getByTestId("cb-question");
  await expect(q).toHaveAttribute("data-question", questionId);
  await q.getByRole("radio", { name: label }).check();
  await q.getByTestId("cb-save").click();
}
async function answerMulti(page: Page, questionId: string, labels: (string | RegExp)[]) {
  const q = page.getByTestId("cb-question");
  await expect(q).toHaveAttribute("data-question", questionId);
  for (const l of labels) await q.getByRole("checkbox", { name: l }).check();
  await q.getByTestId("cb-save").click();
}
async function answerText(page: Page, questionId: string, text: string) {
  const q = page.getByTestId("cb-question");
  await expect(q).toHaveAttribute("data-question", questionId);
  await q.getByRole("textbox").fill(text);
  await q.getByTestId("cb-save").click();
}

test("company builder: interview → plan → real drafts → sample trial → review → activation → history", { tag: "@critical" }, async ({ page }) => {
  test.setTimeout(180_000);
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/company`);
  await expect(page.getByRole("heading", { name: "Build a digital team that knows your work." })).toBeVisible();
  await expect(page.getByRole("link", { name: /advanced editor/ })).toBeVisible();
  await page.getByTestId("cb-start").click();
  await expect(page).toHaveURL(/\/company\/[0-9a-f-]{36}$/);

  await answerSingle(page, "situation", "I'm improving an existing company");
  await answerText(page, "offering", "We run an office cleaning company and answer customer requests by email");
  // The description produced an INFERENCE: shown as a suggestion to confirm, not as a fact.
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "first_outcome");
  await expect(page.getByText("We inferred this from your description")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Following up customer requests" })).toBeChecked();
  await page.getByTestId("cb-save").click();
  await answerSingle(page, "cust_channel", "Email");
  await answerSingle(page, "cust_reviewer", "Me (the owner)");
  await answerSingle(page, "team", "2–10 people");

  // Resume: a reload continues at the next question with nothing lost (no fixed progress total).
  await page.reload();
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "tools");
  await expect(page.getByText("You've answered 6 questions")).toBeVisible();
  // Back returns to the previous question with its answer, without deleting anything.
  await page.getByTestId("cb-back").click();
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "team");
  await expect(page.getByRole("radio", { name: "2–10 people" })).toBeChecked();
  await page.getByTestId("cb-save").click();

  await answerMulti(page, "tools", ["Gmail"]);
  await answerSingle(page, "cust_next", "We reply to the customer");
  await answerText(page, "cust_info", "Our monthly plan price is 300 SAR.\nDelivery of supplies is free inside Riyadh.");
  await page.getByTestId("cb-question").getByTestId("cb-dont-know").click(); // other areas: not yet
  await expect(page.getByText("No more questions would change the plan.")).toBeVisible();

  // Review what we understood: a correction is saved as a new version.
  const facts = page.getByTestId("cb-facts");
  await expect(facts.getByRole("heading", { name: "Review what we understood about your business." })).toBeVisible();
  await facts.getByTestId("cb-edit-team").click();
  await facts.getByRole("radio", { name: "Just me" }).check();
  await facts.getByTestId("cb-save").click();
  await expect(facts.locator('[data-fact="team_size"]')).toContainText("Just me");
  await expect(facts.locator('[data-fact="team_size"]')).toContainText("Version 3"); // answer, re-answer after Back, correction

  // Plan preview (a draft; nothing runs).
  await page.getByTestId("cb-generate").click();
  const plan = page.getByTestId("cb-plan");
  await expect(plan.getByRole("heading", { name: "Your team plan is ready for review." })).toBeVisible();
  await expect(plan.getByTestId("cb-draft-notice")).toHaveText("This is a draft. Nothing runs automatically.");
  await expect(plan.locator('[data-task="customer-triage"]')).toContainText("We need to connect Gmail to run Customer request triage.");
  await expect(plan.locator('[data-task="customer-answers"]')).toContainText("bounded agent");
  await plan.getByTestId("cb-approve").click();
  await plan.getByTestId("cb-install").click();
  await expect(page.getByTestId("cb-installed")).toBeVisible();

  // Sample trial through the real engine; three separate verdicts.
  const task = page.getByTestId("cb-task-customer-triage");
  await expect(task).toHaveAttribute("data-state", "requires_setup");
  await expect(task.getByText("Trial with sample data — we didn't connect to your accounts")).toBeVisible();
  await task.getByTestId("cb-try-customer-triage").click();
  const trial = task.getByTestId("cb-trial-customer-triage");
  await expect(trial).toBeVisible({ timeout: 30_000 });
  await expect(trial).toContainText("The run finished. Review the result.");
  await expect(trial).toHaveAttribute("data-matched", "true");
  await expect(trial).toContainText("Rule-based calculation (no AI)");
  await expect(task).toHaveAttribute("data-state", "sample_verified");

  // The draft is a REAL flow in the existing editor.
  const flowHref = await task.getByTestId("cb-open-flow-customer-triage").getAttribute("href");
  expect(flowHref).toMatch(/\/flows\/[0-9a-f-]{36}$/);

  // Approve the permitted TEST action (local sample outbox).
  await trial.getByTestId("cb-send-review-customer-triage").click();
  const inbox = page.getByTestId("cb-inbox");
  const item = inbox.getByTestId("cb-review-send_sample-customer-triage");
  await expect(item).toHaveAttribute("data-status", "pending");
  await expect(item).toContainText("sample.customer@example.com");
  await expect(item).toContainText("Local test outbox (nothing is sent externally)");
  await expect(item).toContainText("Our monthly plan price is 300 SAR.");
  await item.getByTestId("cb-approve-send_sample-customer-triage").click();
  await expect(item).toHaveAttribute("data-status", "executed");
  await expect(inbox.getByTestId("cb-outbox").locator("li")).toHaveCount(1);

  // Activation needs an explicit development trial (not a payment), then its own review.
  await page.getByTestId("cb-grant-trial").click();
  await expect(page.getByTestId("cb-entitlement")).toContainText("Development trial (not a paid subscription)");
  await task.getByTestId("cb-activate-customer-triage").click();
  const act = inbox.getByTestId("cb-review-activation-customer-triage");
  await expect(act).toHaveAttribute("data-status", "pending");
  await act.getByTestId("cb-approve-activation-customer-triage").click();
  await expect(task).toHaveAttribute("data-state", "active");

  // History: the trial run is in the run log.
  await page.goto(flowHref!);
  await expect(page.getByTestId("node-draft")).toBeVisible();
  await expect(page.getByText("Reply from approved information").first()).toBeVisible();
});

test("company builder: another workspace's member gets 404; nobody but the founder reaches the CLI prototype", { tag: "@critical" }, async ({ browser }) => {
  const a = await browser.newContext({ storageState: EN_STATE });
  const b = await browser.newContext({ storageState: EN_STATE });
  const pa = await a.newPage();
  const pb = await b.newPage();
  const ua = await setupUser(pa);
  const ub = await setupUser(pb);
  const created = await (await pa.request.post(`/api/workspaces/${ua.workspace.id}/company-builder/sessions`, { data: {} })).json();
  const sid = created.session.id as string;
  expect((await pb.request.get(`/api/workspaces/${ua.workspace.id}/company-builder/sessions/${sid}`)).status()).toBe(404);
  expect((await pb.request.get(`/api/workspaces/${ub.workspace.id}/company-builder/sessions/${sid}`)).status()).toBe(404);
  // A workspace owner who isn't the founder can't start or see CLI jobs, even by crafting the request.
  const crafted = await pa.request.post(`/api/workspaces/${ua.workspace.id}/company-builder/sessions/${sid}/cli-jobs`, { data: { cli: "claude", kind: "blueprint", requestKey: "crafted-e2e-01" } });
  expect(crafted.status()).toBe(404);
  await pa.goto(`/w/${ua.workspace.slug}/company/${sid}`);
  await expect(pa.getByTestId("cb-question")).toBeVisible();
  await expect(pa.getByTestId("cb-prototype")).toHaveCount(0);
  await a.close();
  await b.close();
});

test("company builder: Arabic is the default, right-to-left, with the reviewed promise", { tag: "@cross-browser" }, async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/company`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "ابنِ فريقًا رقميًا يعرف شغلك." })).toBeVisible();
  await expect(page.getByTestId("cb-start")).toHaveText("اقترح فريقي");
  await page.getByTestId("cb-start").click();
  await expect(page.getByRole("heading", { name: "ما وضعك الآن؟" })).toBeVisible();
  await expect(page.getByTestId("cb-question").getByRole("radio")).toHaveCount(3);
  await ctx.close();
});

test("company builder: keyboard-only answering; mobile width has no horizontal scroll", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/company`);
  await page.getByTestId("cb-start").focus();
  await page.keyboard.press("Enter");
  const q = page.getByTestId("cb-question");
  await expect(q).toHaveAttribute("data-question", "situation");
  // Focus lands on the question title; Tab reaches the first option; arrows move within the group.
  await expect(q.getByRole("heading")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(q.getByRole("radio").first()).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(q).toHaveAttribute("data-question", "offering");

  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(page.getByTestId("cb-question")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
