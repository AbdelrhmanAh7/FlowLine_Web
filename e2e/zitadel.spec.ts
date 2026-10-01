import { expect, test } from "@playwright/test";
import { setupUser } from "./helpers";
import { BASE_URL, FAKE_PROVIDER } from "./stack";

test("ZITADEL setup saves, tests PKCE/Basic sign-in and enables only after verification @cross-browser", async ({ page }) => {
  const { workspace, email } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/settings?tab=sso`);
  await page.getByLabel("Identity provider").selectOption("zitadel");
  await expect(page.getByText(`${BASE_URL}/api/sso/callback`, { exact: true })).toBeVisible();
  await page.getByLabel("Issuer URL").fill(`${FAKE_PROVIDER}/zitadel`);
  await page.getByLabel("Client ID", { exact: true }).fill("flowline@tenant");
  await page.getByLabel("Client secret", { exact: true }).fill("secret:with!symbols");
  await page.getByLabel("Allowed email domains").fill(email.split("@")[1]!);
  await expect(page.getByLabel("SSO enabled")).toBeDisabled();
  await page.getByRole("button", { name: "Save SSO settings" }).click();
  await expect(page.getByText("Configured — not verified")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Identity provider")).toHaveValue("zitadel");
  await expect(page.getByLabel("Client secret", { exact: true })).toHaveValue("");
  await page.request.post(`${FAKE_PROVIDER}/__fake/oidc/user`, { data: { email } });
  await page.getByRole("button", { name: "Test sign-in" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace.slug}/flows$`));
  await page.goto(`/w/${workspace.slug}/settings?tab=sso`);
  await expect(page.getByText(/^Verified /).first()).toBeVisible();
  await page.getByLabel("SSO enabled").check();
  await page.getByRole("button", { name: "Save SSO settings" }).click();
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
  await expect(page.getByText("secret:with!symbols", { exact: true })).toHaveCount(0);
});
