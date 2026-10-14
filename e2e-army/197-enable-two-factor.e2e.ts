// Issue #197 (account security page 2/4): Enable on the security page asks for the account password. A wrong password
// shows an error and no secret key. Issue #198 (3/4) adds the QR code of the same otpauth:// URI above the secret.
// The correct-password, wrong/right-code and reload cases need the account password and a TOTP code computed from the
// shown secret, so they live in e2e/account-security.spec.ts.
// Both tests stay in this one top-level file: the hub copies only the first 8 `e2e-army/*.e2e.ts` files of the branch
// (README / DEVELOPER_GUIDE), so a second file for #198 would push the repo over that cap.
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
    await expect(screen.getByText("Off", { exact: true })).toBeVisible();
  },
);

test(
  "@issue-198 AC3: a wrong account password shows an error and draws no QR code (the secret never leaves our origin)",
  { tags: ["feat:fl-accounts-sessions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: "not-the-real-password-1" } });
    await agent.assert("an error message is shown and no QR code is displayed");
    await expect(screen.getByTestId("totp-qr")).toHaveCount(0);
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
  },
);
