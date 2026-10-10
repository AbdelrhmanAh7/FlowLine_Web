// UI MISC shard (agent steps + exact checks): the Arabic RTL experience and language switch, the theme switch, the landing page content, the design
// system showcase and the resend-verification page. Public pages need no session.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase, needsModel, freshEmail } from "../lib.ts";
import { Http, PASSWORD, SEED_DOMAIN, anonymous, awaitMail, outbox } from "./_helpers.ts";

const cookie = (name: string, value: string) => [{ url: apiBase(), name, value }];

test("[fl-i18n-rtl.2] switching the language on the sign-in page flips the whole page between Arabic right-to-left and English left-to-right", { tags: ["feat:fl-i18n-rtl", "shard:ui-misc", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  await app.open("/sign-in");
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await expect(screen.getByRole("heading", "مرحبًا بعودتك")).toBeVisible();
  await expect(screen.getByLabel("البريد الإلكتروني")).toBeVisible();
  await expect(screen.getByLabel("كلمة المرور")).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await agent.act("switch the language to English");
  await expect(screen.getByRole("heading", "Welcome back")).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("ltr");
  expect(await browser.evaluate(() => document.documentElement.lang)).toBe("en");
  await agent.act("switch the language to Arabic");
  await expect(screen.getByRole("heading", "مرحبًا بعودتك")).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await agent.assert("the sign-in page is shown in Arabic");
});

test("[fl-theme.1] the theme switch changes the page between light and dark and remembers the choice after a reload", { tags: ["feat:fl-theme", "shard:ui-misc", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const theme = () => browser.evaluate(() => document.documentElement.getAttribute("data-theme") ?? "");
  await browser.setCookies(cookie("fl_locale", "en"));
  await app.open("/sign-in");
  await agent.act("switch the theme to Dark");
  await expect.poll(theme, { timeout: 10_000 }).toBe("dark");
  await expect(screen.getByRole("group", "Theme").getByRole("button", "Dark")).toHaveAttribute("aria-pressed", "true");
  await browser.reload();
  expect(await theme()).toBe("dark");
  await screen.getByRole("group", "Theme").getByRole("button", "Light").tap();
  await expect.poll(theme, { timeout: 10_000 }).toBe("light");
  await browser.reload();
  expect(await theme()).toBe("light");
  await expect(screen.getByRole("heading", "Welcome back")).toBeVisible();
  await agent.assert("the sign-in page is shown with the Light theme button selected");
});

test("[fl-landing.2] the landing page explains the product, lists ready-made templates and its sections are reachable", { tags: ["feat:fl-landing", "shard:ui-misc", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  await browser.setCookies(cookie("fl_locale", "en"));
  await app.open("/");
  await expect(screen.getByRole("heading", { level: 1 })).toContainText("Less repetitive work.");
  await expect(screen.getByRole("heading", "Start from a template")).toBeAttached();
  await agent.assert("the landing page presents Flowline as a way to reduce repetitive work without code, with a call to start free and sections about templates and pricing");
  await agent.act("open the Pricing section from the page navigation");
  await expect(screen.getByRole("heading", "Pricing")).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("[fl-design-system.1] the design system page shows the product's building blocks", { tags: ["feat:fl-design-system", "shard:ui-misc", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  await browser.setCookies(cookie("fl_locale", "en"));
  await app.open("/design-system");
  await expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  await agent.assert("the page is a design system guide that shows colour tokens, buttons and form controls");
  expect((await anonymous().get("/design-system")).status).toBe(200);
});

test("[fl-email-flows.6] the resend-verification page accepts a request for an unverified account and sends a new verification link when the cooldown allows", { tags: ["feat:fl-email-flows", "shard:ui-auth2", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const email = freshEmail("ui-resend", SEED_DOMAIN);
  const up = await new Http().post("/api/auth/sign-up/email", { json: { email, password: PASSWORD, name: "Army Resend" } });
  expect(up.status).toBe(200);
  const first = await awaitMail(anonymous(), email, "verify");
  const before = (await outbox(anonymous(), email, "verify")).length;
  await browser.setCookies(cookie("fl_locale", "en"));
  await app.open("/resend-verification");
  await expect(screen.getByRole("heading", "Resend verification")).toBeVisible();
  await agent.act("request a new verification link for the email {email}", { params: { email } });
  await expect(screen.getByText("If the account is eligible, an email will arrive shortly.")).toBeVisible();
  expect(first.link).toMatch(/verify-email/);
  // Wait for a new verification email to be sent (cooldown respected by the backend; in test mode it is short).
  await expect.poll(async () => (await outbox(anonymous(), email, "verify")).length, { timeout: 30_000, interval: 1000, message: "no new verification mail after resend" }).toBe(before + 1);
  const after = await outbox(anonymous(), email, "verify");
  const newest = after[0]!;
  expect(newest.link).not.toBe(first.link);
  expect(newest.link).toMatch(/verify-email/);
});
