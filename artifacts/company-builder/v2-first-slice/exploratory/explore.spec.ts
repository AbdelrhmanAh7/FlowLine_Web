import { expect, test } from "@playwright/test";
import { setupUser } from "../../../../e2e/helpers";

const OUT = process.env.EXPLORE_OUT ?? "artifacts/company-builder/v2-first-slice/exploratory";

test("exploratory: Arabic first slice, mixed input, Arabic digits, Riyadh time zone, desktop + mobile", async ({ page }) => {
  const { workspace } = await setupUser(page);
  expect((await page.request.patch(`/api/workspaces/${workspace.id}`, { data: { timezone: "Asia/Riyadh" } })).ok()).toBeTruthy();
  const base = `/api/workspaces/${workspace.id}/company-builder`;
  const sid = (await (await page.request.post(`${base}/sessions`, { data: {} })).json()).session.id as string;
  let rev = 1;
  const answers: [string, unknown][] = [
    ["offering", "شركة تنظيف صغيرة، طلبات العملاء تصل على Gmail والمتابعة غير منتظمة"],
    ["first_outcome", "customer"],
    ["situation", "improve"],
    ["cust_channel", "email"],
    ["cust_reviewer", "owner"],
    ["cust_details", ["service", "date", "phone"]],
    ["team", "small"],
    ["tools", ["gmail"]],
    ["cust_next", "reply"],
    ["cust_services", "تنظيف مكاتب|office cleaning, تنظيف عميق|deep cleaning"],
    ["cust_info", "تنظيف المكاتب الشهري بسعر ٣٠٠ ريال.\nنعمل من السبت إلى الخميس، ٨ صباحًا إلى ٦ مساءً.\nDelivery of supplies is free inside Riyadh."],
    ["cust_volume", "20_100"],
    ["other_areas", ["finance", "sales"]],
  ];
  for (const [questionId, value] of answers) {
    const r = await page.request.post(`${base}/sessions/${sid}/answer`, { data: { questionId, value, revision: rev } });
    expect(r.ok(), `${questionId}: ${await r.text()}`).toBeTruthy();
    rev = (await r.json()).session;
  }
  await page.goto(`/w/${workspace.slug}/company/${sid}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: `${OUT}/01-ar-interview-done.png`, fullPage: true });
  await page.getByTestId("cb-generate").click();
  await expect(page.getByTestId("cb-plan")).toBeVisible();
  await page.screenshot({ path: `${OUT}/02-ar-plan.png`, fullPage: true });
  await page.getByTestId("cb-approve").click();
  await page.getByTestId("cb-install").click();
  await expect(page.getByTestId("cb-installed")).toBeVisible();
  const task = page.getByTestId("cb-task-customer-follow-up");
  await task.getByTestId("cb-try-customer-follow-up").click();
  await expect(task.getByTestId("cb-result-customer-follow-up")).toBeVisible({ timeout: 30_000 });
  await task.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/03-ar-result.png`, fullPage: true });
  await task.getByTestId("cb-accept-no-customer-follow-up").click();
  await page.screenshot({ path: `${OUT}/04-ar-reject-reasons.png`, fullPage: true });
  await task.getByTestId("cb-accept-yes-customer-follow-up").click();
  await expect(task).toHaveAttribute("data-state", "sample_verified");
  // Mobile width, still Arabic.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(page.getByTestId("cb-plan")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${OUT}/05-ar-mobile.png`, fullPage: true });
  const texts = { overflowPx: overflow, result: await task.getByTestId("cb-result-customer-follow-up").innerText(), plan: await page.getByTestId("cb-plan").innerText() };
  require("node:fs").writeFileSync(`${OUT}/observed-text.json`, JSON.stringify(texts, null, 2));
});
