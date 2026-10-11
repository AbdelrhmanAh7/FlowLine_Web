import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-177 AC1: the hero button opens the flow demo and the main CTA leads to sign-up", { tags: ["feat:fl-landing"] }, async ({ app, agent, screen }) => {
  await app.open("/");
  await agent.act("click the hero button 'Explore a workflow' (or its Arabic equivalent) and wait for the flow demo section");
  await agent.assert("the flow demo section with the five workflow steps is in view");
  await app.open("/");
  await agent.act("click the hero button 'Start building — free' (or its Arabic equivalent)");
  await agent.assert("the sign-up page is shown with an email and password form");
});

test("@issue-177 AC2: the landing page renders the hero CTA as a link to sign-up", { tags: ["feat:fl-landing"] }, async ({ app }) => {
  const res = await fetch(new URL("/", app.baseUrl!));
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('href="/sign-up"');
  expect(html).toContain('href="/?section=flow-demo"');
});
