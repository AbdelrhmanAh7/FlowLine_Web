import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeCtx, oauthCreds, provider, queryOf, runAction, runVerify, startFake, type Fake } from "./helpers";

const p = provider("gmail");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("gmail identity", () => {
  it("returns the profile email", async () => {
    const id = await p.identity(makeCtx(p, oauthCreds));
    expect(id).toEqual({ accountId: "alice@flowline.test", label: "alice@flowline.test" });
    const r = await fake.lastRequest("gmail");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/gmail/v1/users/me/profile");
  });
});

describe("gmail.search_messages", () => {
  it("searches with q and returns message refs", async () => {
    const out = await runAction<{ messages: { id: string; threadId: string }[]; resultSizeEstimate: number }>(
      "gmail.search_messages",
      makeCtx(p, oauthCreds),
      { q: "invoice", maxResults: 10 },
    );
    expect(out.messages.map((m) => m.id)).toContain("msg-100");
    const r = await fake.lastRequest("gmail");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/gmail/v1/users/me/messages");
    expect(queryOf(r).get("q")).toBe("invoice");
    expect(queryOf(r).get("maxResults")).toBe("10");
  });

  it("q with has:attachment returns both invoice messages, invoice first", async () => {
    const out = await runAction<{ messages: { id: string }[] }>("gmail.search_messages", makeCtx(p, oauthCreds), {
      q: "has:attachment invoice",
      maxResults: 10,
    });
    expect(out.messages.map((m) => m.id)).toEqual(["msg-100", "msg-200"]);
  });
});

describe("gmail.get_message", () => {
  it("GETs the message with format=full and parses headers and attachments", async () => {
    const out = await runAction<{
      id: string;
      threadId: string;
      from: string;
      fromName: string;
      subject: string;
      snippet: string;
      attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[];
    }>("gmail.get_message", makeCtx(p, oauthCreds), { messageId: "msg-100" });
    expect(out).toMatchObject({
      id: "msg-100",
      threadId: "thread-100",
      from: "billing@acme-supplies.test",
      fromName: "Acme Billing",
      subject: "Invoice INV-001",
    });
    expect(out.snippet).toContain("invoice");
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments[0]).toMatchObject({ attachmentId: "att-100", filename: "INV-001.pdf", mimeType: "application/pdf" });
    expect(out.attachments[0]!.size).toBeGreaterThan(0);

    const r = await fake.lastRequest("gmail");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/gmail/v1/users/me/messages/msg-100");
    expect(queryOf(r).get("format")).toBe("full");
  });

  it("parses the injection message (Globex) the same way", async () => {
    const out = await runAction<{ from: string; fromName: string; subject: string; attachments: { attachmentId: string; filename: string }[] }>(
      "gmail.get_message",
      makeCtx(p, oauthCreds),
      { messageId: "msg-200" },
    );
    expect(out.from).toBe("ap@globex.test");
    expect(out.fromName).toBe("Globex AP");
    expect(out.subject).toBe("Invoice INV-002");
    expect(out.attachments[0]).toMatchObject({ attachmentId: "att-200", filename: "INV-002.pdf" });
  });
});

describe("gmail.get_attachment", () => {
  it("returns base64url attachment data with size", async () => {
    const out = await runAction<{ data: string; size: number }>("gmail.get_attachment", makeCtx(p, oauthCreds), {
      messageId: "msg-100",
      attachmentId: "att-100",
    });
    const buf = Buffer.from(out.data, "base64url");
    expect(buf.length).toBe(out.size);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.toString("latin1")).toContain("Invoice INV-001");
    const r = await fake.lastRequest("gmail");
    expect(r.path).toBe("/gmail/v1/users/me/messages/msg-100/attachments/att-100");
  });

  it("serves the seeded prompt-injection attachment verbatim", async () => {
    const out = await runAction<{ data: string; size: number }>("gmail.get_attachment", makeCtx(p, oauthCreds), {
      messageId: "msg-200",
      attachmentId: "att-200",
    });
    expect(Buffer.from(out.data, "base64url").toString("latin1")).toContain("IGNORE PREVIOUS INSTRUCTIONS");
  });
});

describe("gmail.send", () => {
  it("sends base64url RFC822 with the idempotency Message-ID, and verify finds it", async () => {
    const ctx = makeCtx(p, oauthCreds);
    const input = { to: "vendor@acme.test", subject: "Payment sent", body: "Invoice INV-001 paid." };
    const out = await runAction<{ id: string; threadId: string }>("gmail.send", ctx, input);
    expect(out.id).toMatch(/^sent-/);

    const r = await fake.lastRequest("gmail");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/gmail/v1/users/me/messages/send");
    const raw = Buffer.from((r.body as { raw: string }).raw, "base64url").toString("utf8");
    expect(raw).toContain(`To: ${input.to}`);
    expect(raw).toContain(`Subject: ${input.subject}`);
    expect(raw).toContain(`Message-ID: <${ctx.idempotencyKey}@flowline>`);
    expect(raw).toContain(input.body);

    const v = await runVerify<{ id: string; threadId: string }>("gmail.send", ctx, input);
    expect(v.happened).toBe(true);
    expect(v.output?.id).toBe(out.id);
  });

  it("verify reports happened:false for an unsent key", async () => {
    const ctx = makeCtx(p, oauthCreds);
    const v = await runVerify("gmail.send", ctx, { to: "a@b.test", subject: "s", body: "b" });
    expect(v.happened).toBe(false);
  });
});
