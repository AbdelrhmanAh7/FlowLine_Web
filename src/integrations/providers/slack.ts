import { z } from "zod";
import { ProviderError, type ProviderDef } from "../types";

interface SlackOk {
  ok: true;
  [key: string]: unknown;
}

// Slack returns HTTP 200 with { ok: false, error } on failure, which the HTTP layer cannot see.
function checkOk(data: unknown): asserts data is SlackOk {
  const d = data as { ok?: boolean; error?: string } | null;
  if (d?.ok === true) return;
  const error = d?.error ?? "unknown_error";
  const kind =
    error === "invalid_auth" || error === "token_revoked" || error === "token_expired" || error === "not_authed"
      ? "auth"
      : error === "ratelimited"
        ? "rate_limit"
        : "client";
  throw new ProviderError(kind, `Slack: ${error}`);
}

interface SlackMessage {
  ts: string;
  metadata?: { event_payload?: { idempotency_key?: string } };
}

const provider: ProviderDef = {
  id: "slack",
  name: "Slack",
  icon: "💬",
  category: "Messaging",
  description: "Post messages and list channels in a Slack workspace.",
  authType: "oauth2",
  apiBase: "https://slack.com/api",
  oauth: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    revokeUrl: "https://slack.com/api/auth.revoke",
    scopes: ["chat:write", "channels:read", "channels:history"],
    pkce: false,
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
  },
  async identity(ctx) {
    const { data } = await ctx.http.request<{
      ok: boolean;
      team_id: string;
      user_id: string;
      user: string;
      team: string;
    }>({ method: "POST", path: "/auth.test" });
    checkOk(data);
    return { accountId: `${data.team_id}:${data.user_id}`, label: `${data.user} @ ${data.team}` };
  },
  actions: [
    {
      id: "slack.post_message",
      version: 1,
      provider: "slack",
      title: "Post message",
      description:
        "Post a message to a channel. The run's idempotency key is attached as message metadata.",
      input: z.object({
        channel: z.string().max(64),
        text: z.string().max(4000),
      }),
      output: z.object({ ts: z.string(), channel: z.string() }),
      sideEffect: "non_idempotent",
      requiredScopes: ["chat:write", "channels:history"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{ ok: boolean; ts: string; channel: string }>({
          method: "POST",
          path: "/chat.postMessage",
          json: {
            channel: input.channel,
            text: input.text,
            metadata: {
              event_type: "flowline_action",
              event_payload: { idempotency_key: ctx.idempotencyKey },
            },
          },
        });
        checkOk(data);
        return { ts: data.ts, channel: data.channel };
      },
      async verify(ctx, input) {
        const { data } = await ctx.http.request<{ ok: boolean; messages?: SlackMessage[] }>({
          method: "GET",
          path: "/conversations.history",
          query: { channel: input.channel, include_all_metadata: "true", limit: 50 },
        });
        const messages = data.messages ?? [];
        checkOk(data);
        const found = messages.find((m) => m.metadata?.event_payload?.idempotency_key === ctx.idempotencyKey);
        if (!found) return { happened: false };
        return { happened: true, output: { ts: found.ts, channel: input.channel } };
      },
    },
    {
      id: "slack.list_channels",
      version: 1,
      provider: "slack",
      title: "List channels",
      description: "List channels visible to the connected account.",
      input: z.object({
        limit: z.number().int().min(1).max(200).default(100),
      }),
      output: z.object({
        channels: z
          .array(z.object({ id: z.string(), name: z.string(), is_private: z.boolean().optional() }))
          .max(200),
      }),
      sideEffect: "none",
      requiredScopes: ["channels:read"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          ok: boolean;
          channels?: { id: string; name: string; is_private?: boolean }[];
        }>({
          method: "GET",
          path: "/conversations.list",
          query: { limit: input.limit },
        });
        checkOk(data);
        return { channels: data.channels ?? [] };
      },
    },
  ],
  verification: {
    adapter: true,
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
