// Issue #199 (account security page 4/4): Disable is shown only while two-step verification is On. The throwaway user is
// Off, so the page must offer Enable and no Disable. The wrong/right password, sign-in prompt and Arabic cases need a TOTP
// code computed from the enrolment secret, so they live in e2e/account-security.spec.ts and e2e/arabic.spec.ts.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-199 AC1: Disable is not offered while two-step verification is Off",
  { tags: ["feat:fl-accounts-sessions"], session: "fl-user" },
  async ({ app, screen }) => {
    await app.open("/account/security");
    await expect(screen.getByText("Off", { exact: true })).toBeVisible();
    await expect(screen.getByRole("button", { name: "Enable" })).toBeVisible();
    await expect(screen.getByRole("button", { name: "Disable" })).toHaveCount(0);
  },
);
