// Issue #197 (account security page 2/4): Enable on the security page asks for the account password. A wrong password
// shows an error and no secret key. The correct-password, wrong/right-code and reload cases need the account password and
// a TOTP code computed from the shown secret, so they live in e2e/account-security.spec.ts.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-197 AC1: Enable asks for the account password and a wrong password shows an error and no secret",
  { tags: ["feat:fl-accounts-sessions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: "not-the-real-password-1" } });
    await agent.assert("an error message is shown and no secret key is displayed");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
  },
);
