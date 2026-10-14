// Issue #199 (account security page 4/4): with two-step verification Off the page offers Enable and no Disable, and in
// Arabic the page is right-to-left with no horizontal scroll. The wrong/right password, sign-in prompt and the LTR
// secret/backup-code inputs need the account password and a TOTP code computed from the shown secret, so they live in
// e2e/account-security.spec.ts and e2e/arabic.spec.ts.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

/** Agent steps need a model; without one (E2E_ARMY_NOAGENT=1) they are skipped and the locator tests still run. */
const needsModel = () => test.skip(process.env.E2E_ARMY_NOAGENT === "1", "no model available: agent steps skipped");

test(
  "@issue-199 AC1: with two-step verification Off the security page shows Enable and no Disable button",
  { tags: ["feat:fl-accounts-sessions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    needsModel();
    await app.open("/account/security");
    await agent.assert("the Two-step verification status reads Off and an Enable button is shown");
    await expect(screen.getByText("Off", { exact: true })).toBeVisible();
    await expect(screen.getByRole("button", { name: "Disable" })).toHaveCount(0);
    await agent.act("click Enable to open the account password form");
    await expect(screen.getByLabel("Account password")).toBeVisible();
    await agent.act("cancel the account password form");
    await agent.assert("two-step verification is still Off, the password form is hidden, and Enable is available");
    await expect(screen.getByLabel("Account password")).toHaveCount(0);
    await expect(screen.getByRole("button", { name: "Enable" })).toBeVisible();
  },
);

test(
  "@issue-199 AC4: the security page in Arabic is right-to-left with no horizontal scroll",
  { tags: ["feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, browser, screen }) => {
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
    await app.open("/account/security");
    expect(await browser.evaluate(() => document.documentElement.lang)).toBe("ar");
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await expect(screen.getByRole("heading", { name: "التحقق بخطوتين" })).toBeVisible();
    for (const width of [375, 1280]) {
      await browser.setViewport({ width, height: 900 });
      const overflow = await browser.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `account/security @${width}: no horizontal scroll`).toBeLessThanOrEqual(0);
    }
  },
);
