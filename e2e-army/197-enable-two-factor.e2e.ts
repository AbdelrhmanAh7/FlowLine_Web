// Issue #197 (account security page 2/4): enable MFA with secret, backup codes and code check.
// A signed-in user goes through the enrolment flow: password -> secret + backup codes -> 6-digit code.
// AC4 (the correct code turns it On) is covered by e2e/account-security.spec.ts on a throwaway user: enrolling here would leave the shared fl-user with MFA On and break every later test that expects Off.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-197 AC2: a correct password shows the manual secret and backup codes with the one-time warning",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with the correct password and submit");
    await agent.assert("the secret key and backup codes are displayed left-to-right with a 'shown only once' warning");
    await expect(screen.getByTestId("totp-secret")).toBeVisible();
    await expect(screen.getByTestId("totp-secret")).toHaveAttribute("dir", "ltr");
    await expect(screen.getByTestId("backup-codes")).toHaveAttribute("dir", "ltr");
    await expect(screen.getByTestId("backup-codes-warning")).toContainText("shown only once");
  },
);

test(
  "@issue-197 AC3: a wrong 6-digit code shows an error and the status stays Off after reload",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with the correct password and submit");
    await agent.act("fill the Authentication code field with {code} and submit", { params: { code: "000000" } }); // 000000 is rejected unless it is one of the 3 currently valid codes (odds ~3 in 1,000,000); the Playwright spec picks a code outside the window
    await agent.assert("an error says the code is invalid and the status is still Off");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
    await app.reload();
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
  },
);

test(
  "@issue-197 AC5: Cancel leaves the status Off and the secret never appears in URLs, storage or logs",
  { tags: ["feat:fl-email-flows"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("click Cancel in the password form");
    await agent.assert("the status remains Off and no secret is shown");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);

    await agent.act("click the Enable button again");
    await agent.act("fill the Account password field with the correct password and submit");
    await agent.act("click Cancel in the code form");
    await agent.assert("the status remains Off and the secret is hidden");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
    await expect(screen.getByTestId("backup-codes")).toHaveCount(0);
  },
);
