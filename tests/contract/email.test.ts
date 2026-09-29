import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEmailProvider, EmailDeliveryError, type EmailTransportConfig } from "@/server/email";
import { startFake, type Fake } from "./helpers";

describe("email provider adapters", () => {
  let fake: Fake;
  beforeAll(async () => {
    fake = await startFake();
    process.env.FLOWLINE_EMAIL_RESEND_TEST_URL = `${fake.url}/resend/emails`;
    process.env.FLOWLINE_EMAIL_POSTMARK_TEST_URL = `${fake.url}/postmark/email`;
  });
  afterAll(async () => { await fake.close(); });

  // Provider keys come from the platform admin panel (never env); the transport receives them explicitly.
  const cfg = (provider: "resend" | "postmark"): EmailTransportConfig => ({ provider, from: "Flowline <no-reply@flowline.test>", key: provider === "resend" ? "fake-resend" : "fake-postmark" });

  for (const provider of ["resend", "postmark"] as const) {
    it(`sends via ${provider} without exposing the body in request logs`, async () => {
      const link = "https://flowline.test/verify-email?token=secret-link";
      await getEmailProvider(cfg(provider)).send({ to: "a@flowline.test", subject: "Verify", html: `<a href="${link}">Verify</a>`, text: link, idempotencyKey: crypto.randomUUID() });
      const state = await fake.state<{ messages: { to: string; text: string }[] }>(provider);
      expect(state.messages.at(-1)?.to).toBe("a@flowline.test");
      expect(state.messages.at(-1)?.text).toBe(link);
      expect(JSON.stringify(await fake.requests(provider))).not.toContain("secret-link");
    });
    it(`surfaces ${provider} failures`, async () => {
      await fake.fault({ provider, pathPattern: "/email", mode: "500", times: provider === "resend" ? 2 : 1 });
      await expect(getEmailProvider(cfg(provider)).send({ to: "a@flowline.test", subject: "Verify", html: "body", text: "body", idempotencyKey: crypto.randomUUID() })).rejects.toBeInstanceOf(EmailDeliveryError);
    });
    it(`times out ${provider} safely`, async () => {
      process.env.FLOWLINE_EMAIL_TEST_TIMEOUT_MS = "150";
      await fake.fault({ provider, pathPattern: "/email", mode: "timeout", times: provider === "resend" ? 2 : 1 });
      await expect(getEmailProvider(cfg(provider)).send({ to: "a@flowline.test", subject: "Verify", html: "body", text: "body", idempotencyKey: crypto.randomUUID() })).rejects.toBeInstanceOf(EmailDeliveryError);
      delete process.env.FLOWLINE_EMAIL_TEST_TIMEOUT_MS;
    });
  }
});
