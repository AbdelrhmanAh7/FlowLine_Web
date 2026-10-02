import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db, schema } from "@/db";
import { seedPlatformCredential, seedSetting, unseedPlatformCredential, unseedSetting } from "../tests/fixtures/platform-seed";
import { uniqueEmail } from "./helpers";
import { FAKE_PROVIDER } from "./stack";

const CLIENT_ID = "flowline@fake-tenant";
const CLIENT_SECRET = "fake-secret:with!symbols";

test.describe("platform ZITADEL hosted sign-in", () => {
  test.beforeAll(async () => {
    await unseedPlatformCredential("signin.zitadel");
    await unseedSetting("signin.zitadel.issuer");
    await seedSetting("signin.zitadel.issuer", FAKE_PROVIDER);
    await seedPlatformCredential("signin.zitadel", { publicId: CLIENT_ID, secret: CLIENT_SECRET });
  });

  test.afterAll(async () => {
    await unseedPlatformCredential("signin.zitadel");
    await unseedSetting("signin.zitadel.issuer");
  });

  test("verified new customer completes the real code, state and PKCE callback @critical", async ({ page }) => {
    const email = uniqueEmail("zitadel-new");
    expect((await page.request.post(`${FAKE_PROVIDER}/__fake/oidc/user`, { data: { email, email_verified: true } })).ok()).toBe(true);
    const authOptionsResponse = await page.request.get("/api/auth-config");
    const authOptions = await authOptionsResponse.json() as { google: boolean; github: boolean; zitadel: boolean };
    expect(authOptions.zitadel).toBe(true);
    await page.goto("/sign-up");
    await expect(page.getByRole("button", { name: "Continue with secure sign-in" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    if (!authOptions.google) await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
    if (!authOptions.github) await expect(page.getByRole("button", { name: "Continue with GitHub" })).toHaveCount(0);
    const callback = page.waitForRequest((req) => req.url().includes("/api/auth/callback/zitadel?"));
    await page.getByRole("button", { name: "Continue with secure sign-in" }).click();
    const request = await callback;
    const params = new URL(request.url()).searchParams;
    expect(params.get("code")).toMatch(/^oidc-code-/);
    expect(params.get("state")).toBeTruthy();
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
    const session = await page.request.get("/api/auth/get-session");
    expect(session.ok()).toBe(true);
    expect((await session.json()).user.email).toBe(email);
    const [user] = await db.select({ emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.email, email));
    expect(user?.emailVerified).toBe(true);
  });

  test("unverified provider email cannot create a Flowline account @critical", async ({ page }) => {
    const email = uniqueEmail("zitadel-unverified");
    expect((await page.request.post(`${FAKE_PROVIDER}/__fake/oidc/user`, { data: { email, email_verified: false } })).ok()).toBe(true);
    await page.goto("/sign-up");
    const callback = page.waitForRequest((req) => req.url().includes("/api/auth/callback/zitadel?"));
    await page.getByRole("button", { name: "Continue with secure sign-in" }).click();
    await callback;
    await expect(page).toHaveURL(/error=/);
    expect(await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email))).toHaveLength(0);
  });

  test("invite-only beta refuses a verified but uninvited provider user @critical", async ({ page }) => {
    const email = uniqueEmail("zitadel-uninvited");
    expect((await page.request.post("/api/test/beta", { data: { mode: "invite_only" } })).ok()).toBe(true);
    expect((await page.request.post(`${FAKE_PROVIDER}/__fake/oidc/user`, { data: { email, email_verified: true } })).ok()).toBe(true);
    await page.goto("/sign-up");
    const callback = page.waitForRequest((req) => req.url().includes("/api/auth/callback/zitadel?"));
    await page.getByRole("button", { name: "Continue with secure sign-in" }).click();
    await callback;
    await expect(page).toHaveURL(/error=/);
    expect(await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email))).toHaveLength(0);
  });
});
