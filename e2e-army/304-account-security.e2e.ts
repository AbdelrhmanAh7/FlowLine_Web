// tester-army/e2e natural-language tests for Account Security: Two-step verification (#304, replaces #259 / #197)
// AC1: While Off, Enable asks for account password; wrong password shows an error and no secret.
// AC2: Correct password shows manual secret and backup codes with dir="ltr" and one-time warning.
// AC3: Wrong 6-digit code shows an error and status stays Off after reload.
// AC4: Valid 6-digit TOTP code turns status to On, hides secret/codes, and persists across reload.
// AC5: Cancel leaves status Off and the secret hidden.
//
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so helpers live here.
import { createHash, createHmac } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
const seeded = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("hex").slice(0, 10);

function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCodeFor(key: Buffer, now = Date.now(), digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const off = mac[mac.length - 1]! & 15;
  const bin = ((mac[off]! & 127) << 24) | ((mac[off + 1]! & 255) << 16) | ((mac[off + 2]! & 255) << 8) | (mac[off + 3]! & 255);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

async function freshUserSession(base: string, name: string) {
  const email = `army-mfa-${seeded(base, name)}@flowline-e2e.test`;
  const h = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED };
  const up = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email, password: PASSWORD, name: "Army MFA" }),
  });
  if (up.ok) {
    let token = null as string | null;
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token !== null;
    }, { timeout: 12_000, interval: 250, message: "no verification e-mail in test outbox" }).toBe(true);
    if (!token) throw new Error("no verification e-mail in test outbox");
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    if (!v.ok) throw new Error(`verify failed: ${v.status}`);
  }
  const inRes = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!inRes.ok) throw new Error(`sign-in failed: ${inRes.status}`);
  const cookies = inRes.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    return { url: base, name: pair.slice(0, idx), value: pair.slice(idx + 1) };
  });
  return { email, cookies };
}

test(
  "@issue-304 AC1: Enable asks for the account password and a wrong password shows an error and no secret",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl", "feat:fl-workspace-nav"] },
  async ({ app, agent, screen, browser }) => {
    const { cookies } = await freshUserSession(app.baseUrl!, "ac1");
    await browser.setCookies([...cookies, { url: app.baseUrl!, name: "fl_test_beta_mode", value: "open" }, { url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: "definitely-wrong-1" } });
    await agent.assert("an error message is shown and no secret key is displayed");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
  },
);

test(
  "@issue-304 AC2: a correct password shows the manual secret and backup codes with the one-time warning",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl"] },
  async ({ app, agent, screen, browser }) => {
    const { cookies } = await freshUserSession(app.baseUrl!, "ac2");
    await browser.setCookies([...cookies, { url: app.baseUrl!, name: "fl_test_beta_mode", value: "open" }, { url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with the account password {pw} and submit the form", { params: { pw: PASSWORD } });
    await agent.assert("the secret key and backup codes are displayed left-to-right with a warning that backup codes are shown only once");

    const secretEl = screen.getByTestId("totp-secret");
    await expect(secretEl).toBeVisible();
    await expect(secretEl).toHaveAttribute("dir", "ltr");
    const secretText = (await secretEl.text()).trim();
    expect(secretText).toMatch(/^[A-Z2-7]{16,64}$/);

    const backupCodesEl = screen.getByTestId("backup-codes");
    await expect(backupCodesEl).toBeVisible();
    await expect(backupCodesEl).toHaveAttribute("dir", "ltr");
    const backupList = await backupCodesEl.locator("li").all();
    expect(backupList.length).toBeGreaterThanOrEqual(8);

    await expect(screen.getByTestId("backup-codes-warning")).toBeVisible();
  },
);

test(
  "@issue-304 AC3: a wrong 6-digit code shows an error and the status stays Off after reload",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl"] },
  async ({ app, agent, screen, browser }) => {
    const { cookies } = await freshUserSession(app.baseUrl!, "ac3");
    await browser.setCookies([...cookies, { url: app.baseUrl!, name: "fl_test_beta_mode", value: "open" }, { url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: PASSWORD } });
    await agent.act("fill the Authentication code field with {code} and submit the form", { params: { code: "000000" } });
    await agent.assert("an error says the code is invalid and the status is still Off");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
    await app.reload();
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
  },
);

test(
  "@issue-304 AC4: a valid 6-digit TOTP code turns the status On and persists across reload",
  { tags: ["feat:fl-email-flows", "feat:fl-i18n-rtl"] },
  async ({ app, agent, screen, browser }) => {
    const { cookies } = await freshUserSession(app.baseUrl!, "ac4");
    await browser.setCookies([...cookies, { url: app.baseUrl!, name: "fl_test_beta_mode", value: "open" }, { url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: PASSWORD } });
    const secretEl = screen.getByTestId("totp-secret");
    await expect(secretEl).toBeVisible();
    const secret = (await secretEl.text()).trim();
    const validCode = totpCodeFor(base32Decode(secret));

    await agent.act("fill the Authentication code field with {code} and submit the form", { params: { code: validCode } });
    await agent.assert("the status is now On, and the secret key and backup codes are hidden");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("On");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
    await expect(screen.getByTestId("backup-codes")).toHaveCount(0);
    await app.reload();
    await expect(screen.getByTestId("two-factor-status")).toHaveText("On");
  },
);

test(
  "@issue-304 AC5: Cancel leaves the status Off and the secret hidden",
  { tags: ["feat:fl-email-flows"] },
  async ({ app, agent, screen, browser }) => {
    const { cookies } = await freshUserSession(app.baseUrl!, "ac5");
    await browser.setCookies([...cookies, { url: app.baseUrl!, name: "fl_test_beta_mode", value: "open" }, { url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/account/security");
    await agent.act("click the Enable button");
    await agent.act("click the Cancel button in the password form");
    await agent.assert("the status remains Off and no secret is shown");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);

    await agent.act("click the Enable button again");
    await agent.act("fill the Account password field with {pw} and submit the form", { params: { pw: PASSWORD } });
    await agent.act("click the Cancel button in the verification code form");
    await agent.assert("the status remains Off and the secret is hidden");
    await expect(screen.getByTestId("two-factor-status")).toHaveText("Off");
    await expect(screen.getByTestId("totp-secret")).toHaveCount(0);
    await expect(screen.getByTestId("backup-codes")).toHaveCount(0);
  },
);
