// SMOKE shard (≤ 90 s, no model): the public entry points every deploy must keep alive — landing, sign-in, health, RTL default, 404.
// It is also the shard that runs for files no feature claims.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase } from "../lib.ts";
import { actor, anonymous } from "./_helpers.ts";

const lang = (value: "en" | "ar") => [{ url: apiBase(), name: "fl_locale", value }];

test("[fl-landing.1] the landing page shows the product promise and its sign-up and sign-in calls to action", { tags: ["feat:fl-landing", "shard:smoke", "lvl:ui"] }, async ({ app, screen, browser }) => {
  await browser.setCookies(lang("en"));
  await app.open("/");
  await expect(screen.getByRole("heading", { level: 1 })).toContainText("Less repetitive work.");
  await expect(screen.getByRole("link", "Sign in")).toBeVisible();
  await expect(screen.getByRole("link", "Start free")).toBeVisible();
  await screen.getByRole("link", "Start free").tap();
  await expect(browser).toHaveURL("/sign-up");
  await expect(screen.getByRole("heading", "Create your account")).toBeVisible();
});

test("[fl-sign-in.1] a user signs in with e-mail and password and lands in the workspace flows list", { tags: ["feat:fl-sign-in", "shard:smoke", "lvl:ui"] }, async ({ app, screen, browser }) => {
  const { a } = await actor("smoke-signin");
  await browser.setCookies(lang("en"));
  await app.open("/sign-in");
  await expect(screen.getByRole("heading", "Welcome back")).toBeVisible();
  await expect(screen.getByRole("link", "Forgot password?")).toBeVisible();
  await screen.getByLabel("Email").fill(a.email);
  await screen.getByLabel("Password").fill("Army-Passw0rd!");
  await screen.getByRole("button", "Sign in").tap();
  await expect(browser).toHaveURL(new RegExp(`/w/${a.slug}/flows$`));
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Flows");
});

test("[fl-health.1] /api/health reports the database, the worker and the schema version", { tags: ["feat:fl-health", "shard:smoke", "lvl:api"] }, async () => {
  const r = await anonymous().get("/api/health?require=worker");
  expect(r.status).toBe(200);
  expect(r.json).toMatchObject({ db: "ok", worker: "ok" });
  expect(r.json.schemaVersion).toBeGreaterThan(0);
  expect(typeof r.json.revision).toBe("string");
  const plain = await anonymous().get("/api/health");
  expect(plain.status).toBe(200);
  expect(plain.json.db).toBe("ok");
});

test("[fl-health.2] the operations status endpoint does not exist without the ops token", { tags: ["feat:fl-health", "shard:smoke", "lvl:api"] }, async () => {
  const none = await anonymous().get("/api/ops/status");
  expect(none.status).toBe(404);
  expect(none.json.error.code).toBe("NOT_FOUND");
  const wrong = await anonymous().get("/api/ops/status", { headers: { authorization: "Bearer not-the-ops-token-not-the-ops-token" } });
  expect(wrong.status).toBe(404);
});

test("[fl-i18n-rtl.1] Arabic is the default language and the page is right-to-left", { tags: ["feat:fl-i18n-rtl", "shard:smoke", "lvl:ui"] }, async ({ app, browser, screen }) => {
  await app.open("/");
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  expect(await browser.evaluate(() => document.documentElement.lang)).toBe("ar");
  await expect(screen.getByRole("link", "ابدأ مجانًا")).toBeVisible();
});

test("[fl-not-found.1] an unknown page shows the friendly 404 with a way back", { tags: ["feat:fl-not-found", "shard:smoke", "lvl:ui"] }, async ({ app, screen, browser }) => {
  const raw = await anonymous().get("/this-page-does-not-exist-army");
  expect(raw.status).toBe(404);
  await browser.setCookies(lang("en"));
  await app.open("/this-page-does-not-exist-army");
  await expect(screen.getByText("We couldn't find that page")).toBeVisible();
  await expect(screen.getByRole("link", "Go to my workspace")).toBeVisible();
});
