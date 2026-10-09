import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-124 AC1: TestSprite sign-up auto-verify in staging", { tags: ["feat:auth-signup"] }, async ({ app, agent, screen }) => {
  // Set staging environment and auto-verify flag
  process.env.FLOWLINE_ENV = 'test';
  process.env.FLOWLINE_TEST_AUTO_VERIFY = '1';

  // Navigate to sign-up page
  await app.open('/en/signup');

  // Fill sign-up form
  await agent.act("fill sign-up form with {email} and {password}", {
    params: { email: "test@example.com", password: "password123" }
  });

  // Submit sign-up
  await agent.act("submit sign-up form");

  // Verify immediate sign-in
  await expect(screen.getByText("Welcome, test@example.com!")).toBeVisible();

  // Check email was not sent (since auto-verify is enabled)
  const emails = await app.request('/api/test/outbox');
  expect(emails).toHaveLength(0);

  // Verify user is marked as verified
  const user = await app.request('/api/users/test@example.com');
  expect(user.verified).toBe(true);
});