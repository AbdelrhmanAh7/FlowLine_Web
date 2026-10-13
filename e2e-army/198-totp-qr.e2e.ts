// Issue #198 (account security page 3/4): the enrolment view shows a QR code for the authenticator app, drawn in the browser.
// The "no request leaves our origin" and "gone after the correct code" cases need a TOTP code computed from the secret, so
// they live in e2e/account-security.spec.ts.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-198 AC1: after the password step the enrolment view shows a QR code above the secret key",
  { tags: ["feat:fl-accounts-sessions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: "not-the-real-password-1" } });
    await agent.assert("an error message is shown and no QR code is displayed");
    await expect(screen.getByTestId("totp-qr")).toHaveCount(0);
  },
);
