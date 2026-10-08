// Local stand-in for the hub suite's setup (`pnpm e2e:army` only): a verified user signs in, names a workspace and creates a
// blank flow, then the `fl-user` session is saved and the workspace slug written for e2e-army/*.e2e.ts. The hub copies only
// the top-level e2e-army/*.e2e.ts files and brings its own setup, so this file never runs there (one setup per session name).
import { writeFileSync } from "node:fs";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const SLUG_FILE = `${process.env.E2E_ARMY_OUT ?? ".e2e"}/flowline-slug.txt`;

test.setup("a verified user signs in, creates a workspace and a blank flow", { sessions: ["fl-user"] }, async ({ app, screen, browser, session }) => {
  const base = app.baseUrl!, email = `army-${Date.now().toString(36)}@flowline-e2e.test`;
  const origin = new URL(base).origin, h = { "content-type": "application/json", origin, cookie: "fl_test_beta_mode=open; fl_locale=en" };
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (!up.ok) throw new Error(`sign-up ${up.status}`);
  let token: string | null = null;
  for (let i = 0; i < 24 && !token; i++) {
    const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
    const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
    const link = messages.find((m) => m.purpose === "verify")?.link;
    token = link ? new URL(link).searchParams.get("token") : null;
    if (!token) await new Promise((r) => setTimeout(r, 500)); // the outbox is written after the sign-up response
  }
  if (!token) throw new Error("no verification e-mail in the test outbox");
  const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
  if (!v.ok) throw new Error(`verify ${v.status}`);

  await browser.setCookies([{ url: base, name: "fl_locale", value: "en" }]);
  await app.open("/sign-in");
  await screen.getByLabel("Email").fill(email);
  await screen.getByLabel("Password").fill(PASSWORD);
  await screen.getByRole("button", "Sign in").tap();
  await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
  await screen.getByLabel("Workspace name").fill("Army Co");
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("heading", "What do you want to automate first?")).toBeVisible();
  await screen.getByRole("radio", /Sales & lead ops/).tap();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("radio", /Blank flow/).tap();
  await screen.getByRole("button", /Create flow & open canvas/).tap();
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  writeFileSync(SLUG_FILE, new URL(await browser.url()).pathname.split("/")[2] ?? "");
  await session.save("fl-user");
});
