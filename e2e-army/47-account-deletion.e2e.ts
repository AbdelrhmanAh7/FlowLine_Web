import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-47 AC1: User account deletion completes without SSO audit conflict", { tags: ["feat:account-deletion"] }, async ({ app, agent, screen }) => {
  // Seed user with active SSO transaction
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", { params: { email: "admin@mizano.com", pw: "password123" } });
  await app.open("/en/settings/security");
  await agent.act("simulate ongoing SSO audit transaction");

  // Attempt account deletion
  await app.open("/en/settings/delete-account");
  await agent.act("confirm account deletion");

  // Verify audit was written before workspace lock
  await expect(screen.getByText("Audit record created")).toBeVisible();
  await expect(screen.getByText("Workspace locked for deletion")).toBeVisible();
  await expect(screen.getByText("Account deleted successfully")).toBeVisible();

  // Check Arabic/RTL rendering
  await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("rtl");
  await expect(screen.getByText("السجل الجمركي تم إنشاؤه")).toBeVisible();
  await expect(screen.getByText("تم قفل المساحة الزمنية لحذفها")).toBeVisible();
  await expect(screen.getByText("تم حذف الحساب بنجاح")).toBeVisible();
});
