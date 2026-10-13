// Issue #199 (account security page 4/4): Disable is offered only while two-step verification is On. With MFA Off the
// page offers Enable and no Disable. The wrong/right password, sign-in prompt and Arabic cases need the account password
// and a TOTP code computed from the shown secret, so they live in e2e/account-security.spec.ts and e2e/arabic.spec.ts.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-199 AC1: with two-step verification Off the security page shows Enable and no Disable button",
  { tags: ["feat:fl-accounts-sessions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
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
