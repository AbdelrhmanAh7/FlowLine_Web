// Session setup for the FlowLine_Web feature suite (setup tests are not features: no [id], no feat tag).
// `fl-user` = the saved sign-in of a verified owner of a workspace, English UI (the port of the live suite's session, built through the
// product's own API instead of the sign-in/onboarding screens so every UI shard starts in seconds; those screens have their own feature tests).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { actor, browserCookies } from "./_helpers.ts";

test.setup("a verified user is signed in and owns a workspace (session fl-user)", { sessions: ["fl-user"] }, async ({ app, screen, browser, session }) => {
  const { a } = await actor("ui-owner");
  await browser.setCookies(browserCookies(a));
  await app.open("/app");
  // /app continues in the user's last-used workspace (a re-run on the same stack may have created newer ones)
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Flows");
  await session.save("fl-user");
});
