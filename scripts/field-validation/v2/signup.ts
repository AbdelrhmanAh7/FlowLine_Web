import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";

const PASSWORD = "e2e-Passw0rd!";
export const uniqueFieldEmail = () => `field-v2-${randomUUID().slice(0, 8)}@flowline-e2e.test`;

/** Standalone test-outbox signup; importing this module does not initialise e2e/stack. */
export async function signUpFieldUser(req: APIRequestContext, email: string) {
  const signUp = await req.post("/api/auth/sign-up/email", { data: { email, password: PASSWORD, name: "Field Test User" } });
  expect(signUp.ok(), "synthetic signup succeeds").toBe(true);
  expect((await signUp.json()).token === null, "signup waits for verification").toBe(true);
  let link: string | null = null;
  await expect.poll(async () => {
    const response = await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`);
    expect(response.ok(), "test outbox is available").toBe(true);
    const body = await response.json() as { messages?: { purpose?: string; link?: string | null }[] };
    link = body.messages?.find((message) => message.purpose === "verify")?.link ?? null;
    return Boolean(link);
  }, { timeout: 10_000, message: "synthetic verification email" }).toBe(true);
  expect(/\/verify-email\?token=[A-Za-z0-9_-]{40,}/.test(link ?? ""), "verification link is valid").toBe(true);
  const token = new URL(link!).searchParams.get("token");
  const verify = await req.post("/api/email", { data: { action: "verify", token } });
  expect(verify.ok(), "verification endpoint succeeds").toBe(true);
  expect((await verify.json()).status).toBe("done");
  const signIn = await req.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } });
  expect(signIn.ok(), "synthetic sign in succeeds").toBe(true);
}
