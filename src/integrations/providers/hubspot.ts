import { z } from "zod";
import type { ProviderDef } from "../types";

const emailInput = z.string().email().max(320);

const provider: ProviderDef = {
  id: "hubspot",
  name: "HubSpot",
  icon: "🧲",
  category: "CRM",
  description: "Upsert contacts and create deals in HubSpot.",
  authType: "api_key",
  apiBase: "https://api.hubapi.com",
  connectFields: [
    { key: "token", label: "Private app token", secret: true, placeholder: "pat-na1-…" },
  ],
  async identity(ctx) {
    const { data } = await ctx.http.request<{
      portalId: number;
      accountType?: string;
      timeZone?: string;
    }>({ method: "GET", path: "/account-info/v3/details" });
    return { accountId: String(data.portalId), label: `Portal ${data.portalId}` };
  },
  actions: [
    {
      id: "hubspot.upsert_contact",
      version: 1,
      provider: "hubspot",
      title: "Upsert contact",
      description:
        "Create or update a contact, keyed by email. Extra HubSpot properties (firstname, lastname…) can be set via properties.",
      input: z.object({
        email: emailInput,
        // z.record has no .max() in zod 4; cap the property count with refine instead.
        properties: z
          .record(z.string(), z.string().max(2000))
          .refine((r) => Object.keys(r).length <= 50, { message: "At most 50 properties" })
          .default({}),
      }),
      output: z.object({
        contacts: z.array(z.object({ id: z.string(), email: z.string() })),
      }),
      sideEffect: "idempotent",
      requiredScopes: ["crm.objects.contacts.write"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          results: { id: string; properties: { email?: string } }[];
        }>({
          method: "POST",
          path: "/crm/v3/objects/contacts/batch/upsert",
          json: {
            inputs: [
              {
                idProperty: "email",
                id: input.email,
                properties: { email: input.email, ...input.properties },
              },
            ],
          },
        });
        return {
          contacts: data.results.map((r) => ({ id: r.id, email: r.properties.email ?? input.email })),
        };
      },
    },
    {
      id: "hubspot.get_contact",
      version: 1,
      provider: "hubspot",
      title: "Get contact",
      description: "Fetch a contact by email.",
      input: z.object({ email: emailInput }),
      output: z.object({
        id: z.string(),
        properties: z.record(z.string(), z.unknown()),
      }),
      sideEffect: "none",
      requiredScopes: ["crm.objects.contacts.read"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          id: string;
          properties: Record<string, unknown>;
        }>({
          method: "GET",
          path: `/crm/v3/objects/contacts/${encodeURIComponent(input.email)}`,
          query: { idProperty: "email" },
        });
        return { id: data.id, properties: data.properties };
      },
    },
    {
      id: "hubspot.create_deal",
      version: 1,
      provider: "hubspot",
      title: "Create deal",
      description: "Create a deal. Repeating this creates a duplicate, so a lost response is reviewed by a human.",
      input: z.object({
        dealname: z.string().max(200),
        amount: z.string().max(40).optional(),
        pipeline: z.string().max(64).optional(),
        dealstage: z.string().max(64).optional(),
      }),
      output: z.object({ id: z.string() }),
      sideEffect: "non_idempotent",
      requiredScopes: ["crm.objects.deals.write"],
      async run(ctx, input) {
        const properties: Record<string, string> = { dealname: input.dealname };
        if (input.amount !== undefined) properties.amount = input.amount;
        if (input.pipeline !== undefined) properties.pipeline = input.pipeline;
        if (input.dealstage !== undefined) properties.dealstage = input.dealstage;
        const { data } = await ctx.http.request<{ id: string }>({
          method: "POST",
          path: "/crm/v3/objects/deals",
          json: { properties },
        });
        return { id: data.id };
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
