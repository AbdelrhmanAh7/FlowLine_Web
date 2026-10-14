// Issue #196 (account security page 1/4): the user menu links to /account/security, which shows the two-step status.
// A fresh throwaway user has no MFA, so the page must say Off; enabling is covered by the Playwright spec (needs a TOTP code).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-196 AC1: the user menu opens the security page showing two-step verification Off",
  { tags: ["feat:fl-workspace-nav", "feat:fl-email-flows"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/app");
    await agent.act("open the user menu at the bottom of the sidebar");
    await agent.act("click Security in the Account group");
    await expect(screen.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
  },
);

test("@issue-196 AC3: a signed-out visit to the security page redirects to sign-in", { tags: ["feat:fl-email-flows"] }, async ({ app }) => {
  const res = await fetch(new URL("/account/security", app.baseUrl), { redirect: "manual" });
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  expect(res.headers.get("location") ?? "").toContain("/sign-in");
});

test(
  "@issue-197 AC1: Enable asks for the account password and a wrong password shows an error and no secret",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: "not-the-real-password-1" } });
    await agent.assert("an error message is shown and no secret key is displayed");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
  },
);

