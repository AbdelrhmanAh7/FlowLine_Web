/**
 * e2e-army test for Mizano connection with base URL and API key.
 * Tags: feat:flowline-connections (based on feature map convention)
 */

import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-145 AC1: Mizano connection saved with encrypted API key and not returned to client", {
  tags: ["feat:flowline-connections", "e2e-army"],
}, async ({ app, screen }) => {
  // Sign in as admin
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", {
    params: { email: "admin@mizano.com", pw: "password123" },
  });

  // Navigate to connections page
  await app.open("/en/settings/connections");
  await agent.assert("the connections page is displayed");

  // Click Add Connection
  await screen.getByRole("button", { name: /add connection/i }).click();
  await agent.assert("the add connection form is displayed");

  // Select Mizano provider
  await screen.getByRole("combobox", { name: /provider/i }).selectOption("Mizano");
  await agent.assert("Mizano is selected as the provider");

  // Enter base URL and API key
  await screen.getByLabelText(/base url/i).fill("https://abdelrahmans-mac-mini.tailb66912.ts.net:8444");
  await screen.getByLabelText(/api key/i).fill("mizano-test-key-12345");
  await agent.assert("base URL and API key are entered");

  // Save connection
  await screen.getByRole("button", { name: /save/i }).click();
  await agent.assert("the connection is saved and shows success message");

  // Verify the connection exists
  await expect(screen.getByText(/mizano/i)).toBeVisible();

  // Verify the API key is NOT visible (should be redacted)
  const keyField = screen.getByLabelText(/api key/i);
  await expect(keyField).toHaveValue(/••••••••••/); // Redacted

  // Verify the connection details do not contain the raw key
  const connectionDetails = await screen.getByText(/mizano/i).locator().allTextContent();
  const containsKey = connectionDetails.some((text) => text.includes("mizano-test-key-12345"));
  expect(containsKey).toBe(false);
});

test("@issue-145 AC2: Test connection shows OK for valid credentials", {
  tags: ["feat:flowline-connections", "e2e-army"],
}, async ({ app, screen }) => {
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", {
    params: { email: "admin@mizano.com", pw: "password123" },
  });

  await app.open("/en/settings/connections");
  await screen.getByRole("button", { name: /add connection/i }).click();
  await screen.getByRole("combobox", { name: /provider/i }).selectOption("Mizano");

  await screen.getByLabelText(/base url/i).fill("https://abdelrahmans-mac-mini.tailb66912.ts.net:8444");
  await screen.getByLabelText(/api key/i).fill("mizano-test-key-12345");

  // Click Test connection
  await screen.getByRole("button", { name: /test connection/i }).click();
  await agent.assert("the test connection button shows OK or success message");

  // Verify success message
  const successIndicator = screen.getByRole("status", { name: /test connection/i });
  await expect(successIndicator).toBeVisible();
  await expect(successIndicator).toHaveText(/ok|success/i);
});

test("@issue-145 AC3: Test connection shows clear error for invalid credentials", {
  tags: ["feat:flowline-connections", "e2e-army"],
}, async ({ app, screen }) => {
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", {
    params: { email: "admin@mizano.com", pw: "password123" },
  });

  await app.open("/en/settings/connections");
  await screen.getByRole("button", { name: /add connection/i }).click();
  await screen.getByRole("combobox", { name: /provider/i }).selectOption("Mizano");

  await screen.getByLabelText(/base url/i).fill("https://abdelrahmans-mac-mini.tailb66912.ts.net:8444");
  await screen.getByLabelText(/api key/i).fill("wrong-key-12345");

  // Click Test connection
  await screen.getByRole("button", { name: /test connection/i }).click();
  await agent.assert("the test connection button shows an error message");

  // Verify error message is clear (401 or authentication error)
  const errorIndicator = screen.getByRole("status", { name: /test connection/i });
  await expect(errorIndicator).toBeVisible();
  await expect(errorIndicator).toHaveText(/401|unauthorized|authentication failed/i);
});

test("@issue-145 RTL: Mizano connection form works in Arabic", {
  tags: ["feat:flowline-connections", "e2e-army"],
}, async ({ app, screen }) => {
  await app.open("/ar/login");
  await agent.act("sign in as {email} with password {pw}", {
    params: { email: "admin@mizano.com", pw: "password123" },
  });

  await app.open("/ar/settings/connections");
  await agent.assert("the connections page is displayed in Arabic");

  // Select Mizano provider
  await screen.getByRole("combobox", { name: /provider/i }).selectOption("Mizano");

  // Enter base URL and API key
  await screen.getByLabelText(/base url/i).fill("https://abdelrahmans-mac-mini.tailb66912.ts.net:8444");
  await screen.getByLabelText(/api key/i).fill("mizano-test-key-12345");

  // Save connection
  await screen.getByRole("button", { name: /save/i }).click();
  await agent.assert("the connection is saved in Arabic");
});
