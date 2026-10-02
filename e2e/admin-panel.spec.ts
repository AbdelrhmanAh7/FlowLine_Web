import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Response } from "@playwright/test";
import { base32Decode, totpCodeFor } from "./tools/totp";
import { EN_STATE } from "../playwright.config";
import { PASSWORD, setupUser, signUpVerified, uniqueEmail } from "./helpers";

/**
 * Credentials in the UI (docs/security/CREDENTIALS_DESIGN.md): the platform admin is onboarded THROUGH THE UI from an
 * operator-issued setup code, enrols TOTP, steps up, and enters a credential in a write-only field. A canary secret
 * must never come back: not in the DOM, storage, the URL or any response. Traces/screenshots/videos are OFF for this
 * file so the canary can't land in evidence artifacts either.
 */
test.use({ trace: "off", screenshot: "off", video: "off" });

const CANARY = `FLCANARY_${randomUUID().replace(/-/g, "")}`;

/** Runs the operator CLI on the test stack's DB and returns the printed one-time code. */
function issueSetupCode(email: string): string {
  const run = (flag: string) => execSync(`node scripts/with-env.mjs .env.test npx tsx scripts/admin/bootstrap.mts --email ${email}${flag}`, { encoding: "utf8", env: { ...process.env, FLOWLINE_ENV: "test" } });
  let out: string;
  try {
    out = run("");
  } catch {
    out = run(" --grant"); // the shared test DB already completed first-admin setup: add this admin with a grant challenge
  }
  const token = out.split(/\r?\n/).map((l) => l.trim()).find((l) => /^[A-Za-z0-9_-]{40,}$/.test(l));
  expect(token, "the CLI prints a one-time code").toBeTruthy();
  return token!;
}

async function collectResponses(page: Page) {
  const bodies: string[] = [];
  page.on("response", (r: Response) => {
    void r
      .text()
      .then((t) => bodies.push(`${r.url()}\n${JSON.stringify(r.headers())}\n${t}`))
      .catch(() => {});
  });
  return bodies;
}

test("platform admin: onboard from a CLI setup code, enrol TOTP, step up, save a write-only credential (canary never leaks)", async ({ page }) => {
  test.setTimeout(120_000);
  const bodies = await collectResponses(page);
  const email = uniqueEmail("platform-admin");
  const token = issueSetupCode(email);

  // 1. Redeem the setup code (POSTed from the form, never in a URL).
  await page.goto("/admin/setup");
  await page.getByLabel("Setup code").fill(token);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(`Setting up the platform admin for ${email}`)).toBeVisible();
  expect(page.url()).not.toContain(token);

  // 2. The bound identity creates and verifies its account (the test stack's outbox is its inbox).
  await signUpVerified(page.request, email, "Platform Admin");
  await page.reload();

  // 3. Enrol an authenticator: the secret is shown once, a code confirms it.
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Generate secret" }).click();
  const base32 = (await page.getByTestId("totp-secret").textContent())!.trim();
  const raw = base32Decode(base32);
  await page.getByLabel("Code from the app").fill(totpCodeFor(raw));
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect(page.getByText("Authenticator enrolled.")).toBeVisible();

  // 4. Complete setup with a fresh code → platform admin.
  await page.locator("#setup-final-code").fill(totpCodeFor(raw));
  await page.getByRole("button", { name: "Complete setup" }).click();
  await expect(page.getByText("Setup is complete. You are a platform administrator.")).toBeVisible();
  await page.getByRole("link", { name: "Open the platform panel" }).click();
  await expect(page.getByRole("heading", { name: "Platform admin" })).toBeVisible();
  await expect(page.getByText("Redirect URIs to register")).toBeVisible();
  await expect(page.getByText(/\/api\/oauth\/callback/).first()).toBeVisible();

  // 5. Writes are locked until a step-up (a NEW code: codes can't be replayed).
  const card = page.getByTestId("credential-integration.github");
  await expect(card.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Authenticator code").fill(totpCodeFor(raw, Date.now() + 30_000));
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText(/Changes unlocked until/)).toBeVisible();

  // Draft copy is previewed in both languages and stays private until published.
  await page.getByRole("link", { name: "Copy editor" }).click();
  await expect(page.getByRole("heading", { name: "Copy editor" })).toBeVisible();
  await page.locator("#copy-search").fill("platformAdmin.copyEditor.previewNote");
  const copyKey = page.getByRole("button", { name: /platformAdmin.copyEditor.previewNote/ });
  await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(1);
  await copyKey.click();
  await expect(copyKey).toHaveAttribute("aria-pressed", "true");
  const originalEn = await page.locator("#copy-en").inputValue();
  const originalAr = await page.locator("#copy-ar").inputValue();
  const englishPreview = page.locator('div[lang="en"]').getByRole("paragraph").filter({ hasText: /^Previewed English copy$/ });
  const publishedNote = page.locator('div[lang="en"]').locator("..").locator(":scope > p");
  try {
    await page.locator("#copy-en").fill("Previewed English copy");
    await page.locator("#copy-ar").fill("نص عربي للمعاينة");
    await expect(englishPreview).toBeVisible();
    await expect(page.locator('[lang="ar"]').getByText("نص عربي للمعاينة", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();
    // A reload selects the first key again, so re-select the edited key before checking its values and previews.
    const reselect = async () => {
      await page.locator("#copy-search").fill("platformAdmin.copyEditor.previewNote");
      await page.getByRole("button", { name: /platformAdmin.copyEditor.previewNote/ }).click();
      await expect(page.getByRole("button", { name: /platformAdmin.copyEditor.previewNote/ })).toHaveAttribute("aria-pressed", "true");
    };
    await page.reload();
    await reselect();
    // The saved draft persisted across the reload: both fields and both previews show the draft values.
    await expect(page.locator("#copy-en")).toHaveValue("Previewed English copy");
    await expect(page.locator("#copy-ar")).toHaveValue("نص عربي للمعاينة");
    await expect(englishPreview).toBeVisible();
    await expect(page.locator('[lang="ar"]').getByText("نص عربي للمعاينة", { exact: true })).toBeVisible();
    // Saving a draft leaves the published UI note unchanged.
    await expect(publishedNote).toHaveText(originalEn);
    await page.getByRole("button", { name: "Publish draft" }).click();
    await expect(page.getByText("Copy published.")).toBeVisible();
    await page.reload();
    await reselect();
    await expect(page.locator("#copy-en")).toHaveValue("Previewed English copy");
    await expect(page.locator("#copy-ar")).toHaveValue("نص عربي للمعاينة");
    await expect(englishPreview).toBeVisible();
    await expect(page.locator('[lang="ar"]').getByText("نص عربي للمعاينة", { exact: true })).toBeVisible();
    await expect(publishedNote).toHaveText("Previewed English copy");
  } finally {
    // Always restore the shared published copy, even if an assertion above failed mid-way. Selecting a key while the editor
    // is dirty raises window.confirm (accept it), and Save/Publish are disabled when there is nothing to save or publish.
    page.once("dialog", (d) => void d.accept());
    await page.goto(page.url());
    await page.locator("#copy-search").fill("platformAdmin.copyEditor.previewNote");
    await page.getByRole("button", { name: /platformAdmin.copyEditor.previewNote/ }).click();
    await page.locator("#copy-en").fill(originalEn);
    await page.locator("#copy-ar").fill(originalAr);
    const save = page.getByRole("button", { name: "Save draft" });
    if (await save.isEnabled()) {
      await save.click();
      await expect(page.getByText("Draft saved.")).toBeVisible();
    }
    const publish = page.getByRole("button", { name: "Publish draft" });
    if (await publish.isEnabled()) {
      await publish.click();
      await expect(page.getByText("Copy published.")).toBeVisible();
    }
    // Verify the published copy is back to the originals.
    await page.reload();
    await page.locator("#copy-search").fill("platformAdmin.copyEditor.previewNote");
    await page.getByRole("button", { name: /platformAdmin.copyEditor.previewNote/ }).click();
    expect(await page.locator("#copy-en").inputValue()).toBe(originalEn);
    expect(await page.locator("#copy-ar").inputValue()).toBe(originalAr);
    await expect(publishedNote).toHaveText(originalEn);
  }
  await page.getByRole("link", { name: "Back to admin" }).click();

  // 6. Enter a credential: write-only field (password type, no autofill/save), cleared after submit.
  const secret = card.getByLabel("Secret");
  await expect(secret).toHaveAttribute("type", "password");
  await expect(secret).toHaveAttribute("autocomplete", "new-password");
  await expect(secret).toHaveAttribute("data-1p-ignore", "");
  await expect(secret).toHaveAttribute("data-lpignore", "true");
  await card.getByLabel("Client ID").fill("e2e-github-client");
  await secret.fill(CANARY);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The secret is stored encrypted and won't be shown again.")).toBeVisible();
  await expect(card.getByText("Configured — not verified")).toBeVisible();
  await expect(card.getByText(`Ends in ••••${CANARY.slice(-4)}`)).toBeVisible();
  await expect(secret).toHaveValue("");

  // 7. The canary is nowhere the browser can see it.
  await page.reload();
  await expect(card.getByText("Configured — not verified")).toBeVisible();
  expect(await page.content()).not.toContain(CANARY);
  const storage = await page.evaluate(async () => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    idb: JSON.stringify(((await indexedDB.databases?.()) ?? []).map((d) => d.name)),
  }));
  expect(JSON.stringify(storage)).not.toContain(CANARY);
  expect(page.url()).not.toContain(CANARY);
  // Let pending response bodies settle, then scan them all.
  await page.waitForTimeout(500);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.join("\n")).not.toContain(CANARY);

  // 8. Revoke + clear through the UI (explicit, confirmed actions).
  await card.getByRole("button", { name: "Revoke" }).click();
  await expect(card.getByRole("alertdialog")).toContainText("Revoking can't recall requests already in progress");
  await expect(card.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("alertdialog")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Revoke", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(secret).toBeFocused();
  await card.getByRole("button", { name: "Clear" }).click();
  await expect(card.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("alertdialog")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Clear", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByText("Not configured")).toBeVisible();
  await expect(secret).toBeFocused();

  // Self-revocation must remove the cached privileged panel as well as revoke access on the server (DV2-F01).
  const self = page.getByRole("listitem").filter({ hasText: email });
  await self.getByRole("button", { name: "Revoke admin", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(self.getByRole("alertdialog")).toBeVisible();
  await expect(self.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(self.getByRole("alertdialog")).toHaveCount(0);
  await expect(self.getByRole("button", { name: "Revoke admin", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const revokedPage = page.waitForResponse((r) => r.request().isNavigationRequest() && new URL(r.url()).pathname === "/admin");
  await self.getByRole("button", { name: "Confirm", exact: true }).focus();
  await page.keyboard.press("Enter");
  expect((await revokedPage).status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Platform admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "We couldn't find that page", exact: true })).toBeVisible();
  expect((await page.request.get("/api/platform/me")).status()).toBe(404);
});

test("a non-admin visiting /admin sees the ordinary 404 page, not a redirect that reveals the panel", async ({ page }) => {
  await setupUser(page);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  expect(page.url()).toMatch(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Platform admin" })).toHaveCount(0);
});

test("members see which OAuth app asks for consent BEFORE the provider redirect (workspace-owned app)", async ({ page, browser }) => {
  const owner = await setupUser(page);
  const ws = owner.workspace;
  // Owner configures the workspace's own Google app in Settings → OAuth apps (write-only secret).
  await page.goto(`/w/${ws.slug}/settings?tab=oauthApps`);
  const google = page.getByTestId("oauth-app-google");
  await google.getByLabel("Client ID").fill("e2e-ws-google-client");
  const secret = google.getByLabel("Client secret");
  await expect(secret).toHaveAttribute("type", "password");
  await secret.fill(`ws-${CANARY}`);
  await google.getByRole("button", { name: "Save app" }).click();
  await expect(page.getByText("App saved. It becomes verified after the first successful Connect.")).toBeVisible();
  await expect(secret).toHaveValue("");
  expect(await page.content()).not.toContain(CANARY);

  // An editor opens Connect for Google Sheets: the dialog states the workspace-owned app and its client id first.
  const editorEmail = uniqueEmail("oauth-editor");
  const invite = await page.request.post(`/api/workspaces/${ws.id}/invites`, { data: { email: editorEmail, role: "editor" } });
  expect(invite.ok(), await invite.text()).toBeTruthy();
  const inviteUrl = (await invite.json()).url as string;
  const ctx = await browser.newContext({ storageState: EN_STATE });
  const editor = await ctx.newPage();
  await signUpVerified(editor.request, editorEmail);
  const accepted = await editor.request.post(`/api/invites/${new URL(inviteUrl).pathname.split("/").pop()}`);
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
  await editor.goto(`/w/${ws.slug}/integrations`);
  await editor.getByRole("listitem").filter({ has: editor.getByText("Google Sheets", { exact: true }) }).getByRole("button", { name: "Connect" }).click();
  const note = editor.getByTestId("oauth-provenance");
  await expect(note).toContainText("uses its OWN");
  await expect(note).toContainText("e2e-ws-google-client");
  await expect(note).toContainText(owner.email);
  await ctx.close();

  // The owner removes the app: the confirmation states how many connections it issued.
  await google.getByRole("button", { name: "Remove" }).click();
  await expect(google.getByRole("alertdialog")).toContainText("0 active connections were issued by this app.");
  await google.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/App removed/)).toBeVisible();
});
