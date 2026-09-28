import { safeFetch } from "@/server/egress";
import { recipientAllowed } from "./sandbox";
export { recipientAllowed } from "./sandbox";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Record<string, string>;
  idempotencyKey: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor(message = "Email delivery failed. Please try again later.") { super(message); }
}

function config() {
  const provider = process.env.FLOWLINE_EMAIL_PROVIDER ?? (process.env.FLOWLINE_ENV === "test" ? "outbox" : undefined);
  if (!provider || !["resend", "postmark", "outbox"].includes(provider)) throw new EmailDeliveryError("Email provider is not configured.");
  if (provider === "outbox" && process.env.FLOWLINE_ENV !== "test" && process.env.NODE_ENV === "production") {
    throw new EmailDeliveryError("Outbox cannot be used in production.");
  }
  const from = process.env.FLOWLINE_EMAIL_FROM;
  if (!from && provider !== "outbox") throw new EmailDeliveryError("Email sender is not configured.");
  return { provider, from: from ?? "Flowline <no-reply@flowline.test>" };
}

export function getEmailProvider(): EmailProvider {
  const { provider, from } = config();
  if (provider === "outbox") return {
    async send(message) {
      const { db, schema } = await import("@/db");
      await db.insert(schema.emailOutbox).values({ recipient: message.to, subject: message.subject, html: message.html, plainText: message.text, tags: message.tags ?? {}, idempotencyKey: message.idempotencyKey }).onConflictDoNothing();
    },
  };
  const key = provider === "resend" ? process.env.FLOWLINE_EMAIL_RESEND_KEY : process.env.FLOWLINE_EMAIL_POSTMARK_TOKEN;
  if (!key) throw new EmailDeliveryError("Email provider credential is not configured.");
  return {
    async send(message) {
      const resend = provider === "resend";
      const url = process.env.FLOWLINE_ENV === "test"
        ? (resend ? process.env.FLOWLINE_EMAIL_RESEND_TEST_URL : process.env.FLOWLINE_EMAIL_POSTMARK_TEST_URL) ?? (resend ? "https://api.resend.com/emails" : "https://api.postmarkapp.com/email")
        : resend ? "https://api.resend.com/emails" : "https://api.postmarkapp.com/email";
      const headers: Record<string, string> = resend
        ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey }
        : { "X-Postmark-Server-Token": key, "Content-Type": "application/json" };
      const body = resend
        ? { from, to: [message.to], subject: message.subject, html: message.html, text: message.text, tags: Object.entries(message.tags ?? {}).map(([name, value]) => ({ name, value })) }
        : { From: from, To: message.to, Subject: message.subject, HtmlBody: message.html, TextBody: message.text, Tag: message.tags?.purpose };
      // Resend supports an idempotency key, so a transient failure can be retried once.
      for (let attempt = 0; attempt < (resend ? 2 : 1); attempt++) {
        try {
          const timeoutMs = process.env.FLOWLINE_ENV === "test" ? Number(process.env.FLOWLINE_EMAIL_TEST_TIMEOUT_MS ?? 8_000) : 8_000;
          const response = await safeFetch(url, { method: "POST", headers, body: JSON.stringify(body), timeoutMs, maxBytes: 16_384, maxRedirects: 0 });
          if (response.status >= 200 && response.status < 300) return;
          if (!resend || attempt || (response.status !== 429 && response.status < 500)) throw new EmailDeliveryError();
        } catch (error) {
          if (!resend || attempt || error instanceof EmailDeliveryError) throw new EmailDeliveryError();
        }
      }
      throw new EmailDeliveryError();
    },
  };
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!recipientAllowed(message.to)) throw new EmailDeliveryError("Recipient is outside the email sandbox.");
  await getEmailProvider().send(message);
}
