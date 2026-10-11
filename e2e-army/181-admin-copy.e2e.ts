import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-181 AC1: Invalid admin copy data shows error", { tags: ["feat:admin-copy"] }, async ({ app, agent, screen }) => {
  await app.open("/en/admin/copy");
  
  // Test invalid JSON format
  await agent.act("paste invalid JSON {data} and submit", {
    params: { data: "invalid{json}" }
  });
  await expect(screen.getByText("Invalid JSON format")).toBeVisible();
  
  // Test missing required fields
  await agent.act("submit empty form");
  await expect(screen.getByText("Missing required fields")).toBeVisible();
  
  // Test permission denied error
  await agent.act("simulate permission denied");
  await expect(screen.getByText("Permission denied")).toBeVisible();
  
  // Test network error
  await agent.act("simulate network error");
  await expect(screen.getByText("Network error occurred")).toBeVisible();
});

// Arabic/RTL test
test("@issue-181 AC2: Arabic error messages shown", { tags: ["feat:admin-copy"] }, async ({ app, agent, screen }) => {
  await app.open("/ar/admin/copy");
  
  await agent.act("submit empty form");
  await expect(screen.getByText("الحقائق المطلوبة مفقودة")).toBeVisible();
  
  await agent.act("simulate network error");
  await expect(screen.getByText("حدث خطأ في الشبكة")).toBeVisible();
});