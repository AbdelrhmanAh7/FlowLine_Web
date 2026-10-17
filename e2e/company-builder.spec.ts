import { expect, test, type Page } from "@playwright/test";
import { AR_STATE, EN_STATE } from "../playwright.config";
import { setupUser } from "./helpers";

/**
 * Company Builder first vertical slice — Customer Request Follow-up (DETERMINISTIC_TEST mode — no AI key, no CLI, no
 * external account): outcome-first interview → edit/confirm profile → plan preview (one outcome, zero agents) → create
 * the draft → sample trial → human-readable result → the person's acceptance → approve a permitted test action →
 * activation → inspect history.
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

test("company builder (first slice): outcome-first interview → plan → draft → sample trial → my acceptance → review → activation → history", { tag: "@critical" }, async ({ page }) => {
  test.setTimeout(180_000);
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/company`);
  await expect(page.getByRole("heading", { name: "Build a digital team that knows your work." })).toBeVisible();
  await expect(page.getByRole("link", { name: /advanced editor/ })).toBeVisible();
  await page.getByTestId("cb-start").click();
  await expect(page).toHaveURL(/\/company\/[0-9a-f-]{36}$/);

  // Outcome first: the first question asks for the result to improve, in the person's own words.
  await expect(page.getByRole("heading", { name: "What is the first result you want to improve? Describe it in your own words." })).toBeVisible();
  await answerText(page, "offering", "I run a small service business. Customer requests arrive by email and follow-up is inconsistent.");
  // The description produced an INFERENCE: shown as a suggestion to confirm, not as a fact.
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "first_outcome");
  await expect(page.getByText("We inferred this from your description")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Following up customer requests" })).toBeChecked();
  await page.getByTestId("cb-save").click();
  await answerSingle(page, "situation", "I'm improving an existing company");
  await answerSingle(page, "cust_channel", "Email");
  await answerSingle(page, "cust_reviewer", "Me (the owner)");
  await answerMulti(page, "cust_details", ["The service they need", "A suitable date", "A phone number"]);
  await answerSingle(page, "team", "2–10 people");
  // Wait for the save to finish before reloading; a click only dispatches the request.
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "tools");

  // Resume: a reload continues at the next question with nothing lost (no fixed progress total).
  await page.reload();
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "tools");
  await expect(page.getByText("You've answered 7 questions")).toBeVisible();
  // Back returns to the previous question with its answer, without deleting anything.
  await page.getByTestId("cb-back").click();
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "team");
  await expect(page.getByRole("radio", { name: "2–10 people" })).toBeChecked();
  await page.getByTestId("cb-save").click();

  await answerMulti(page, "tools", ["Gmail"]);
  await answerSingle(page, "cust_next", "We reply to the customer");
  await answerText(page, "cust_services", "office cleaning, deep cleaning");
  await answerText(page, "cust_info", "Our monthly plan price is 300 SAR.\nDelivery of supplies is free inside Riyadh.");
  await page.getByTestId("cb-question").getByTestId("cb-dont-know").click(); // volume: I don't know yet
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

  // The first output is a PLAN (a draft; nothing runs): one outcome, one role, zero agents, honest setup and cost.
  await page.getByTestId("cb-generate").click();
  const plan = page.getByTestId("cb-plan");
  await expect(plan.getByTestId("cb-draft-notice")).toHaveText("This is a draft. Nothing runs automatically.");
  await expect(plan.getByTestId("cb-primary-outcome")).toHaveAttribute("data-primary-task", "customer-follow-up");
  await expect(plan.getByTestId("cb-plan-section-goal")).toContainText("Prepare and track customer follow-ups");
  await expect(plan.getByTestId("cb-plan-section-integrations")).toContainText("Needs Gmail connection.");
  await expect(plan.getByTestId("cb-plan-section-integrations")).not.toContainText("until you connect");
  await expect(plan.getByTestId("cb-plan-section-integrations")).toContainText("Uses sample data only. Connecting your account doesn't change that in this version.");
  await expect(plan.getByTestId("cb-plan-section-approval")).toContainText("Requires approval before sending.");
  await expect(plan.getByTestId("cb-plan-section-team").locator("[data-role]")).toHaveCount(1);
  await expect(plan.getByTestId("cb-plan-section-team")).toContainText("Never sends a reply without approval");
  await expect(plan.getByTestId("cb-cost")).toContainText("No AI models: fixed rules only, so no AI cost.");
  await expect(plan.getByTestId("cb-cost")).toContainText("Monthly runs: unknown until you tell us your request volume.");
  await expect(plan.getByTestId("cb-next-improvements")).toContainText("An assistant that answers free-form questions");
  await expect(plan.getByTestId("cb-next-improvements").getByRole("button")).toHaveCount(0); // never activatable from here
  await expect(page.getByText("Your company is running")).toHaveCount(0);
  // VF-03: the plan says plainly that connecting Gmail alone won't enable live email in this version.
  await expect(plan.getByTestId("cb-live-not-available")).toContainText("Connecting Gmail alone won't turn it on");
  await plan.getByTestId("cb-approve").click();
  await plan.getByTestId("cb-install").click();
  await expect(page.getByTestId("cb-installed")).toBeVisible();

  // Sample trial through the real engine; three separate verdicts, then a human-readable result.
  const task = page.getByTestId("cb-task-customer-follow-up");
  await expect(task).toHaveAttribute("data-state", "requires_setup");
  await expect(task.getByText("Trial with sample data — we didn't connect to your accounts")).toBeVisible();
  await task.getByTestId("cb-try-customer-follow-up").click();
  const trial = task.getByTestId("cb-trial-customer-follow-up");
  await expect(trial).toBeVisible({ timeout: 30_000 });
  await expect(trial).toContainText("Ran without errors. Review the result.");
  await expect(trial).toHaveAttribute("data-matched", "true");
  const result = task.getByTestId("cb-result-customer-follow-up");
  await expect(result).toContainText("Reply ready for your review");
  await expect(result).toContainText("sample.customer@example.com");
  await expect(result).toContainText("Our monthly plan price is 300 SAR.");
  await expect(result).toContainText("We ask the customer for: A suitable date, A phone number");
  await expect(result).toContainText(/Follow up by: .*UTC/); // explicit time zone
  // Checks passed, but the result isn't verified until the person says it matches what they wanted.
  await expect(task).toHaveAttribute("data-state", "requires_setup");
  await expect(task).toContainText("Review the sample result and tell us if it matches what you wanted");
  await expect(task).toContainText("Does this result match what you wanted?");
  await task.getByTestId("cb-accept-no-customer-follow-up").click();
  await task.getByTestId("cb-reject-reason-customer-follow-up").getByRole("radio", { name: "Wrong tone" }).check();
  await task.getByTestId("cb-reject-confirm-customer-follow-up").click();
  await expect(task.getByTestId("cb-user-verdict-customer-follow-up")).toHaveAttribute("data-verdict", "rejected");
  await expect(task).toContainText("You said the result doesn't match");
  await expect(task.getByTestId("cb-activate-customer-follow-up")).toHaveCount(0);
  await task.getByTestId("cb-accept-yes-customer-follow-up").click();
  await expect(task.getByTestId("cb-user-verdict-customer-follow-up")).toHaveAttribute("data-verdict", "accepted");
  await expect(task).toHaveAttribute("data-state", "sample_verified");
  await expect(task).toContainText("Your answer doesn't prove every detail is right");
  // Refresh keeps everything (no double run, no lost answer) — and the honest sample-only state.
  await page.reload();
  await expect(task).toHaveAttribute("data-state", "sample_verified");
  await expect(task).toContainText("Sample data only: Company Builder doesn't read or send email in this version");
  await expect(task.getByTestId("cb-activation-sample-only-customer-follow-up")).toContainText("doesn't watch your inbox or send email");
  await expect(task.getByTestId("cb-user-verdict-customer-follow-up")).toHaveAttribute("data-verdict", "accepted");

  // The draft is a REAL flow in the existing editor (an Advanced link, not the main path).
  const flowLink = task.getByTestId("cb-open-flow-customer-follow-up");
  await expect(flowLink).toHaveText("Advanced: open the workflow");
  const flowHref = await flowLink.getAttribute("href");
  expect(flowHref).toMatch(/\/flows\/[0-9a-f-]{36}$/);

  // Approve the permitted TEST action (local sample outbox).
  await trial.getByTestId("cb-send-review-customer-follow-up").click();
  const inbox = page.getByTestId("cb-inbox");
  const item = inbox.getByTestId("cb-review-send_sample-customer-follow-up");
  await expect(item).toHaveAttribute("data-status", "pending");
  await expect(item).toContainText("sample.customer@example.com");
  await expect(item).toContainText("Local test outbox (nothing is sent externally)");
  await expect(item).toContainText("Our monthly plan price is 300 SAR.");
  await item.getByTestId("cb-approve-send_sample-customer-follow-up").click();
  await expect(item).toHaveAttribute("data-status", "executed");
  await expect(inbox.getByTestId("cb-outbox").locator("li")).toHaveCount(1);
  await expect(inbox.getByTestId("cb-outbox-note")).toHaveText("Approving a test action records the text here only. No email was sent.");

  // Activation needs an explicit development trial (not a payment), then its own review.
  await page.getByTestId("cb-grant-trial").click();
  await expect(page.getByTestId("cb-entitlement")).toContainText("Development trial (not a paid subscription)");
  await task.getByTestId("cb-activate-customer-follow-up").click();
  const act = inbox.getByTestId("cb-review-activation-customer-follow-up");
  await expect(act).toHaveAttribute("data-status", "pending");
  await act.getByTestId("cb-approve-activation-customer-follow-up").click();
  await expect(task).toHaveAttribute("data-state", "active");
  // Honest state (VF-03): "active" never implies live email handling in this version.
  await expect(task).toContainText("Sample data only: Company Builder doesn't read or send email in this version, and connecting Gmail alone won't change that");

  // History: the trial run is in the run log.
  await page.goto(flowHref!);
  await expect(page.getByTestId("node-draft")).toBeVisible();
  await expect(page.getByText("Reply from approved information, ask for missing details").first()).toBeVisible();
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
  const ctx = await browser.newContext({ storageState: AR_STATE });
  const page = await ctx.newPage();
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/company`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "ابنِ فريقًا رقميًا يفهم عملك." })).toBeVisible();
  await expect(page.getByTestId("cb-start")).toHaveText("اقترح فريقًا لي");
  await page.getByTestId("cb-start").click();
  // Outcome first, in Arabic: the first question asks for the result to improve (free text, mixed input allowed).
  await expect(page.getByRole("heading", { name: "ما أول نتيجة تريد تحسينها في عملك؟ صفها بكلماتك." })).toBeVisible();
  await answerText(page, "offering", "طلبات العملاء تصل على الإيميل Gmail والمتابعة غير منتظمة");
  await expect(page.getByTestId("cb-question")).toHaveAttribute("data-question", "first_outcome");
  await expect(page.getByTestId("cb-question").getByRole("radio", { name: "متابعة طلبات العملاء" })).toBeChecked();
  // Product rule: Arabic text, RTL, but digits 0–9 only (owner decision 2026-10-01).
  await expect(page.getByText("أجبت عن سؤال واحد")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
  await ctx.close();
});

test("company builder: keyboard-only answering; mobile width has no horizontal scroll", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/company`);
  await page.getByTestId("cb-start").focus();
  await page.keyboard.press("Enter");
  const q = page.getByTestId("cb-question");
  await expect(q).toHaveAttribute("data-question", "offering");
  // Focus lands on the question title; Tab reaches the answer box; typing then saving works without a mouse.
  await expect(q.getByRole("heading")).toBeFocused();
  for (let i = 0; i < 6 && !(await q.getByRole("textbox").evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(q.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("We want to follow up customer requests");
  for (let i = 0; i < 8 && !(await q.getByTestId("cb-save").evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(q).toHaveAttribute("data-question", "first_outcome");
  // Arrows move within the option group; Enter saves.
  await expect(q.getByRole("heading")).toBeFocused();
  for (let i = 0; i < 6 && !(await q.getByRole("radio").first().evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(q.getByRole("radio").first()).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(q).toHaveAttribute("data-question", "situation");

  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(page.getByTestId("cb-question")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("company builder: deleting an interview shows a failure instead of swallowing it, and a double click is harmless (FB2-10)", async ({ page }) => {
  const { workspace } = await setupUser(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`/w/${workspace.slug}/company`);
  await page.getByTestId("cb-start").click();
  await expect(page).toHaveURL(/\/company\/[0-9a-f-]{36}$/);
  const sessionUrl = page.url();
  // A failing delete keeps the person on the interview and says so.
  const failDelete = (r: import("@playwright/test").Route) =>
    r.request().method() === "DELETE" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }) }) : r.fallback();
  await page.route("**/company-builder/sessions/*", failDelete);
  await page.getByTestId("cb-delete").click();
  await page.getByTestId("cb-delete-confirm").click();
  await expect(page.getByTestId("cb-delete-error")).toBeVisible();
  expect(page.url()).toBe(sessionUrl);
  await page.unroute("**/company-builder/sessions/*", failDelete);
  // A double click deletes once and lands on the Company Builder start page, with no unhandled error.
  await page.getByTestId("cb-delete-confirm").dblclick();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace.slug}/company$`));
  expect(pageErrors).toEqual([]);
});
