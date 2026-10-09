// UI AUTH shard (natural-language agent steps + exact checks): sign-in errors, sign-up, the e-mail links (verify, forgot/reset password),
// the onboarding wizard and accepting an invitation. English UI unless a test says otherwise; accounts and mail come from the throwaway stack.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase, needsModel, seeded, seededEmail } from "../lib.ts";
import { Http, PASSWORD, SEED_DOMAIN, actor, anonymous, awaitMail, signIn, signUpVerified, tokenOf } from "./_helpers.ts";

const cookies = (locale: "en" | "ar" = "en") => [
  { url: apiBase(), name: "fl_locale", value: locale },
  { url: apiBase(), name: "fl_test_beta_mode", value: "open" },
];

test("[fl-sign-in.2] a wrong password is rejected on the sign-in screen and the user stays there", { tags: ["feat:fl-sign-in", "shard:ui-auth", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { a } = await actor("ui-signin-wrong");
  await browser.setCookies(cookies());
  await app.open("/sign-in");
  await expect(screen.getByLabel("Email")).toBeVisible();
  await agent.act("sign in with the email {email} and the password {pw}", { params: { email: a.email, pw: "definitely-wrong-1" } });
  await expect(screen.getByText("That email and password don't match.")).toBeVisible();
  await agent.assert("an error tells the user that the e-mail or password is wrong, and the user is still on the sign-in screen");
  await expect(browser).toHaveURL("/sign-in");
});

test("[fl-sign-up.1] a visitor creates an account and is told to open the link sent to their e-mail", { tags: ["feat:fl-sign-up", "shard:ui-auth", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const email = seededEmail("ui-signup", SEED_DOMAIN);
  await browser.setCookies(cookies());
  await app.open("/sign-up");
  await expect(screen.getByRole("heading", "Create your account")).toBeVisible();
  await agent.act("create an account with the name {name}, the email {email} and the password {pw}", { params: { name: "Army Signup", email, pw: PASSWORD } });
  await expect(screen.getByRole("heading", "Check your inbox")).toBeVisible();
  await expect(screen.getByText(email, { visible: true })).toBeVisible();
  await expect(screen.getByRole("button", "Send a new link")).toBeVisible();
  const mail = await awaitMail(anonymous(), email, "verify");
  expect(mail.link).toMatch(/\/verify-email\?token=/);
  await agent.assert("the page tells the user that a verification link was sent to the e-mail address and offers to send a new link");
  expect((await anonymous().post("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(403);
});

test("[fl-email-flows.1] opening the e-mailed verification link and confirming activates the account", { tags: ["feat:fl-email-flows", "shard:ui-auth", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const email = seededEmail("ui-verify", SEED_DOMAIN);
  const h = new Http();
  expect((await h.post("/api/auth/sign-up/email", { json: { email, password: PASSWORD, name: "Army Verify" } })).status).toBe(200);
  const mail = await awaitMail(h, email, "verify");
  await browser.setCookies(cookies());
  await app.open(mail.link!);
  await expect(screen.getByRole("heading", "Verify email")).toBeVisible();
  await agent.act("confirm the e-mail address");
  await expect(screen.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await expect(screen.getByRole("link", "Continue to sign in")).toBeVisible();
  await agent.assert("the page confirms that the e-mail address is verified and offers to continue to sign in");
  expect((await signIn(email)).cookies()).not.toEqual({});
  await app.open(mail.link!);
  await screen.getByRole("button", "Verify email").tap();
  await expect(screen.getByText("This link was already used. Request a new one.")).toBeVisible();
});

test("[fl-email-flows.5] a forgotten password is reset from the e-mailed link and the new password signs in", { tags: ["feat:fl-email-flows", "shard:ui-auth2", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const email = seededEmail("ui-reset", SEED_DOMAIN);
  await signUpVerified(email, "Army Reset");
  await browser.setCookies(cookies());
  await app.open("/sign-in");
  await screen.getByRole("link", "Forgot password?").tap();
  await expect(screen.getByRole("heading", "Forgot password?")).toBeVisible();
  await agent.act("request a password reset link for the email {email}", { params: { email } });
  await expect(screen.getByText("If the account is eligible, an email will arrive shortly.")).toBeVisible();
  const mail = await awaitMail(anonymous(), email, "reset");
  await app.open(mail.link!);
  await expect(screen.getByRole("heading", "Set a new password")).toBeVisible();
  const next = `${PASSWORD}-new`;
  await agent.act("choose the new password {pw} and submit", { params: { pw: next } });
  await expect(screen.getByText("Your password changed. Sign in to continue.")).toBeVisible();
  expect((await anonymous().post("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(401);
  expect((await anonymous().post("/api/auth/sign-in/email", { json: { email, password: next } })).status).toBe(200);
  expect(tokenOf(mail.link)).toBeTruthy();
});

test("[fl-onboarding.2] a new user names a workspace, picks a goal and opens a first blank flow on the canvas", { tags: ["feat:fl-onboarding", "shard:ui-auth2", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const email = seededEmail("ui-onboard", SEED_DOMAIN);
  await signUpVerified(email, "Army Onboard");
  await browser.setCookies(cookies());
  await app.open("/sign-in");
  await screen.getByLabel("Email").fill(email);
  await screen.getByLabel("Password").fill(PASSWORD);
  await screen.getByRole("button", "Sign in").tap();
  await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
  await expect(screen.getByLabel("Workspace name")).toBeVisible();
  await agent.act("name the workspace {name} and continue to the next step", { params: { name: `Army Onboarding ${seeded("onboard-ws", 4)}` } });
  await expect(screen.getByRole("heading", "What do you want to automate first?")).toBeVisible();
  await agent.act("choose the goal Support automation, continue, then choose to start from a blank flow and create the flow");
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  await agent.assert("the flow builder canvas is shown and invites the user to start with a trigger");
  const me = (await (await signIn(email)).get("/api/me")).json;
  expect(me.onboarding).toMatchObject({ completed: true, goal: "support" });
  expect(me.workspaces).toHaveLength(1);
});

test("[fl-members.3] an invited person signs in with the invited address and joins the workspace with the invited role", { tags: ["feat:fl-members", "shard:ui-auth", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const owner = await actor("ui-invite-owner");
  const email = seededEmail("ui-invitee", SEED_DOMAIN);
  await signUpVerified(email, "Army Invitee");
  const inv = await owner.http.post(`/api/workspaces/${owner.a.workspaceId}/invites`, { json: { email, role: "editor" } });
  expect(inv.status).toBe(201);
  await browser.setCookies(cookies());
  await app.open(inv.json.url);
  await screen.getByLabel("Email").fill(email);
  await screen.getByLabel("Password").fill(PASSWORD);
  await screen.getByRole("button", "Sign in").tap();
  await expect(screen.getByRole("heading", "Join a workspace")).toBeVisible();
  await expect(screen.getByText(owner.a.workspaceName)).toBeVisible();
  await agent.act("accept the invitation");
  await expect(browser).toHaveURL(new RegExp(`/w/${owner.a.slug}/flows$`));
  await agent.assert("the workspace flows page is shown");
  const members = (await owner.http.get(`/api/workspaces/${owner.a.workspaceId}/members`)).json.members as { email: string; role: string }[];
  expect(members.find((m) => m.email === email)?.role).toBe("editor");
});
