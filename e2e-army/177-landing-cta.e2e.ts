import { test } from "@e2e-dev/web";

test("@issue-177 AC1: the hero button opens the flow demo and the main CTA leads to sign-up", { tags: ["feat:fl-landing"] }, async ({ app, agent }) => {
  await app.open("/");
  await agent.act("click the hero button 'Explore a workflow' (or its Arabic equivalent) and wait for the flow demo section");
  await agent.assert("the flow demo section with the five workflow steps is in view");
  await app.open("/");
  await agent.act("click the hero button 'Start building — free' (or its Arabic equivalent)");
  await agent.assert("the sign-up page is shown with an email and password form");
});

test("@issue-177 AC2: the hero shows the main CTA and the flow demo link on the landing page", { tags: ["feat:fl-landing"] }, async ({ app, agent }) => {
  await app.open("/");
  await agent.assert("the hero shows a 'Start building — free' link to sign-up and an 'Explore a workflow' link to the flow demo");
});
