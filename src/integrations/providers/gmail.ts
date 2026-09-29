import { z } from "zod";
import { ProviderError, type ProviderDef } from "../types";

const ATTACHMENT_CAP = 5 * 1024 * 1024;

const messageListOutput = z.object({
  messages: z.array(z.object({ id: z.string(), threadId: z.string() })).max(100),
  resultSizeEstimate: z.number(),
});

const provider: ProviderDef = {
  id: "gmail",
  name: "Gmail",
  icon: "✉️",
  category: "Email",
  description: "Search messages, fetch attachments and send email via Gmail.",
  authType: "oauth2",
  apiBase: "https://gmail.googleapis.com",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    pkce: true,
    extraParams: { access_type: "offline", prompt: "consent" },
  },
  async identity(ctx) {
    const { data } = await ctx.http.request<{ emailAddress: string }>({
      method: "GET",
      path: "/gmail/v1/users/me/profile",
    });
    return { accountId: data.emailAddress, label: data.emailAddress };
  },
  actions: [
    {
      id: "gmail.search_messages",
      version: 1,
      provider: "gmail",
      title: "Search messages",
      description: "Search messages with a Gmail query string.",
      input: z.object({
        q: z.string().max(500),
        maxResults: z.number().int().min(1).max(100).default(20),
      }),
      output: messageListOutput,
      sideEffect: "none",
      requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          messages?: { id: string; threadId: string }[];
          resultSizeEstimate?: number;
        }>({
          method: "GET",
          path: "/gmail/v1/users/me/messages",
          query: { q: input.q, maxResults: input.maxResults },
        });
        return { messages: data.messages ?? [], resultSizeEstimate: data.resultSizeEstimate ?? 0 };
      },
    },
    {
      id: "gmail.get_message",
      version: 1,
      provider: "gmail",
      title: "Get message",
      description: "Fetch a full message: headers, snippet and attachment metadata.",
      input: z.object({
        messageId: z.string().max(128),
      }),
      output: z.object({
        id: z.string(),
        threadId: z.string(),
        from: z.string(),
        fromName: z.string(),
        subject: z.string(),
        snippet: z.string(),
        attachments: z
          .array(
            z.object({
              attachmentId: z.string(),
              filename: z.string(),
              mimeType: z.string(),
              size: z.number(),
            }),
          )
          .max(50),
      }),
      sideEffect: "none",
      requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<GmailFullMessage>({
          method: "GET",
          path: `/gmail/v1/users/me/messages/${input.messageId}`,
          query: { format: "full" },
        });
        const headers = data.payload?.headers ?? [];
        const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
        const { email: from, name: fromName } = parseFrom(header("From"));
        const attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[] = [];
        const walk = (parts: GmailPart[] | undefined) => {
          for (const part of parts ?? []) {
            if (part.body?.attachmentId) {
              attachments.push({
                attachmentId: part.body.attachmentId,
                filename: part.filename ?? "",
                mimeType: part.mimeType ?? "application/octet-stream",
                size: part.body.size ?? 0,
              });
            }
            walk(part.parts);
          }
        };
        walk(data.payload?.parts);
        return {
          id: data.id,
          threadId: data.threadId,
          from,
          fromName,
          subject: header("Subject"),
          snippet: data.snippet ?? "",
          attachments,
        };
      },
    },
    {
      id: "gmail.get_attachment",
      version: 1,
      provider: "gmail",
      title: "Get attachment",
      description: "Download a message attachment (base64url), capped at 5MB.",
      input: z.object({
        messageId: z.string().max(128),
        attachmentId: z.string().max(256),
      }),
      output: z.object({ data: z.string(), size: z.number() }),
      sideEffect: "none",
      requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{ size: number; data: string }>({
          method: "GET",
          path: `/gmail/v1/users/me/messages/${input.messageId}/attachments/${input.attachmentId}`,
        });
        if (data.size > ATTACHMENT_CAP) {
          throw new ProviderError("client", "Attachment exceeds the 5MB cap");
        }
        return { data: data.data, size: data.size };
      },
    },
    {
      id: "gmail.send",
      version: 1,
      provider: "gmail",
      title: "Send email",
      description: "Send a plain-text email. The run's idempotency key is set as the Message-ID.",
      input: z.object({
        to: z.string().email().max(320),
        subject: z.string().max(200),
        body: z.string().max(20_000),
        cc: z.string().email().max(320).optional(),
        bcc: z.string().email().max(320).optional(),
      }),
      output: z.object({ id: z.string(), threadId: z.string() }),
      sideEffect: "non_idempotent",
      requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
      sensitive: true,
      async run(ctx, input) {
        const raw = buildRaw(input.to, input.subject, input.body, ctx.idempotencyKey, input.cc, input.bcc);
        const { data } = await ctx.http.request<{ id: string; threadId: string }>({
          method: "POST",
          path: "/gmail/v1/users/me/messages/send",
          json: { raw },
        });
        return { id: data.id, threadId: data.threadId };
      },
      async verify(ctx) {
        const { data } = await ctx.http.request<{
          messages?: { id: string; threadId: string }[];
        }>({
          method: "GET",
          path: "/gmail/v1/users/me/messages",
          query: { q: `rfc822msgid:${ctx.idempotencyKey}@flowline`, maxResults: 1 },
        });
        const found = data.messages?.[0];
        if (!found) return { happened: false };
        return { happened: true, output: { id: found.id, threadId: found.threadId } };
      },
    },
  ],
  verification: {
    adapter: true,
    betaScope: "core",
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

function buildRaw(to: string, subject: string, body: string, idempotencyKey: string, cc?: string, bcc?: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Message-ID: <${idempotencyKey}@flowline>`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];
  return Buffer.from([...headers, "", body].join("\r\n"), "utf8").toString("base64url");
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailFullMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    parts?: GmailPart[];
  };
}

function parseFrom(value: string): { email: string; name: string } {
  const m = /^\s*(?:"([^"]*)"|([^<]*?))\s*<([^>]+)>\s*$/.exec(value);
  if (m) return { email: m[3]!.trim(), name: (m[1] ?? m[2] ?? "").trim() };
  return { email: value.trim(), name: "" };
}

export default provider;
