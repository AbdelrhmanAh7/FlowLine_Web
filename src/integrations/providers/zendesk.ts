import { z } from "zod";
import { ProviderError, type Credentials, type ProviderDef } from "../types";

// The real Zendesk base URL is per-subdomain, captured as a non-secret connect setting.
function base(creds: Credentials): string {
  const subdomain = creds.settings?.subdomain;
  if (!subdomain) throw new ProviderError("client", "Zendesk subdomain is missing");
  // A bare label only: "evil.com/x?" would otherwise send the credentials to another host.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(subdomain)) throw new ProviderError("client", "Zendesk subdomain must be just the name before .zendesk.com");
  return `https://${subdomain}.zendesk.com`;
}

const provider: ProviderDef = {
  id: "zendesk",
  name: "Zendesk",
  icon: "🎧",
  category: "Support",
  description: "Search tickets and update ticket fields in Zendesk.",
  authType: "basic",
  apiBase: "https://zendesk.com",
  connectFields: [
    { key: "email", label: "Agent email", secret: false },
    { key: "token", label: "API token", secret: true },
    { key: "subdomain", label: "Subdomain", secret: false, placeholder: "acme" },
  ],
  async identity(ctx) {
    const { data } = await ctx.http.request<{
      user: { id: number; email: string; name: string };
    }>({ method: "GET", path: "/api/v2/users/me.json", baseUrl: base(ctx.credentials) });
    return {
      accountId: String(data.user.id),
      label: `${data.user.name} <${data.user.email}>`,
    };
  },
  actions: [
    {
      id: "zendesk.list_tickets",
      version: 1,
      provider: "zendesk",
      title: "List tickets",
      description: "Search open tickets (status below solved), optionally with extra search terms.",
      input: z.object({
        query: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      output: z.object({
        tickets: z
          .array(
            z.object({
              id: z.number(),
              subject: z.string(),
              status: z.string(),
              priority: z.string().nullable(),
            }),
          )
          .max(100),
      }),
      sideEffect: "none",
      requiredScopes: ["tickets:read"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          results: { id: number; subject: string; status: string; priority: string | null }[];
        }>({
          method: "GET",
          path: "/api/v2/search.json",
          baseUrl: base(ctx.credentials),
          query: {
            query: `type:ticket status<solved${input.query ? " " + input.query : ""}`,
            per_page: input.limit,
          },
        });
        return { tickets: data.results };
      },
    },
    {
      id: "zendesk.update_ticket",
      version: 1,
      provider: "zendesk",
      title: "Update ticket",
      description:
        "Update ticket fields (priority, tags, group). Comments are not supported by this action.",
      input: z
        .object({
          ticketId: z.number().int().positive(),
          priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
          tags: z.array(z.string().max(100)).max(20).optional(),
          group_id: z.number().int().positive().optional(),
        })
        .refine((v) => v.priority !== undefined || v.tags !== undefined || v.group_id !== undefined, {
          message: "At least one of priority, tags or group_id must be provided",
        }),
      output: z.object({ id: z.number(), status: z.string() }),
      sideEffect: "idempotent",
      requiredScopes: ["tickets:write"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{ ticket: { id: number; status: string } }>({
          method: "PUT",
          path: `/api/v2/tickets/${input.ticketId}.json`,
          baseUrl: base(ctx.credentials),
          json: {
            ticket: {
              ...(input.priority && { priority: input.priority }),
              ...(input.tags && { tags: input.tags }),
              ...(input.group_id && { group_id: input.group_id }),
            },
          },
        });
        return { id: data.ticket.id, status: data.ticket.status };
      },
    },
  ],
  verification: {
    adapter: true,
    betaScope: "deferred",
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
