// Issue #198 (account security page 3/4): the enrolment view shows a QR code for the authenticator app, drawn in the browser.
// The hub's fl-user session has no password this test knows, so it covers the invalid case: no QR without the right password.
// The happy path (QR above the secret, one enable call, no foreign request, gone after confirm/Cancel, RTL bounds) needs the
// password and a TOTP code computed from the secret, so it lives in e2e/account-security.spec.ts.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-198 AC3: a wrong account password shows an error and draws no QR code",
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
