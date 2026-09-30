import { expect, test, type APIRequestContext } from "@playwright/test";
import { BASE_URL, EN_STATE } from "../playwright.config";
import { PASSWORD, setupUser, uniqueEmail, verificationLink } from "./helpers";

/**
 * Private beta (invite_only) through the real sign-up UI. The test stack runs with sign-up open for the rest of the
 * suite, so each test switches invite_only on for ITS OWN browser context via the test-only /api/test/beta toggle
 * (a cookie that is ignored outside FLOWLINE_ENV=test).
 */
async function inviteOnly(req: APIRequestContext, createCode = false) {
  const res = await req.post("/api/test/beta", { data: { mode: "invite_only", createCode } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { code?: string };
}

async function inbox(req: APIRequestContext, email: string) {
  return ((await (await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`)).json()) as { messages: unknown[] }).messages;
}

test("private beta: an uninvited email is refused with a clear reason (no fake 'check your email'); a beta code admits", { tag: "@cross-browser" }, async ({ page }) => {
  const { code } = await inviteOnly(page.request, true);
  expect(code).toMatch(/^FL-/);
  expect((await (await page.request.get("/api/auth-config")).json()).betaMode).toBe("invite_only");

  await page.goto("/sign-up");
  await expect(page.getByRole("note")).toHaveText("Flowline is in private beta: sign-up needs an invitation or a beta access code.");
  const stranger = uniqueEmail("stranger");
  await page.getByLabel("Name").fill("Stranger");
  await page.getByLabel("Email").fill(stranger);
  await page.getByLabel("Password").fill(PASSWORD);
  await expect(page.getByLabel("Beta access code (optional)")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Flowline is in private beta — use the email your invitation was sent to, or a beta access code.");
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toHaveCount(0);
  expect(await inbox(page.request, stranger)).toEqual([]);

  // A wrong code is refused the same way; the real code admits this email.
  await page.getByLabel("Beta access code (optional)").fill("FL-NOT-A-REAL-CODE");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(/private beta/);
  await page.getByLabel("Beta access code (optional)").fill(code!);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await verificationLink(page.request, stranger);

  // The single-use code was consumed by the sign-up (not by the pre-checks): it admits nobody else now.
  const again = await page.request.post("/api/beta/check", { data: { email: uniqueEmail("late"), code } });
  expect(await again.json()).toMatchObject({ allowed: false, mode: "invite_only" });

  // Resend from the "check your inbox" state answers honestly without revealing anything.
  await page.getByRole("button", { name: "Send a new link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "If the account is eligible, a new link is on its way." })).toBeVisible();
});

test("private beta: invitation link → sign up with the invited email → verify → sign in → accept", { tag: "@critical" }, async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { workspace } = await setupUser(page, { workspace: "Beta Invite Co" });
  const invitee = uniqueEmail("beta-invitee");
  const created = await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email: invitee, role: "editor" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { url } = (await created.json()) as { url: string };

  const ctx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL }, storageState: EN_STATE });
  const p = await ctx.newPage();
  await inviteOnly(p.request);
  await p.goto(url);
  await expect(p).toHaveURL(/\/sign-in\?next=invite%3A/);
  await p.getByRole("link", { name: "Create an account" }).click();
  await expect(p.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(p.getByText("Use the email address your invitation was sent to.")).toBeVisible();
  await p.getByLabel("Name").fill("Invited Person");
  await p.getByLabel("Email").fill(invitee);
  await p.getByLabel("Password").fill(PASSWORD);
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  const link = await verificationLink(p.request, invitee);
  expect(new URL(link).searchParams.get("callbackURL")).toMatch(/^\/sign-in\?next=invite%3A/);
  await p.goto(link);
  await p.getByRole("button", { name: "Verify email" }).click();
  await p.getByRole("link", { name: "Continue to sign in" }).click();
  await expect(p).toHaveURL(/\/sign-in\?next=invite%3A/);
  await p.getByLabel("Email").fill(invitee);
  await p.getByLabel("Password").fill(PASSWORD);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();

  // Back on the invitation, signed in as the invited email.
  await expect(p.getByRole("heading", { name: "Join a workspace" })).toBeVisible();
  await expect(p.getByText(/invited to/)).toContainText("Beta Invite Co");
  await p.getByRole("button", { name: "Accept invitation" }).click();
  await expect(p).toHaveURL(new RegExp(`/w/${workspace.slug}/flows$`));
  await ctx.close();
});
