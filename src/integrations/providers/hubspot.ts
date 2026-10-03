import { z } from "zod";
import { ProviderError, type ActionContext, type ActionDef, type HttpRequest, type ProviderDef } from "../types";

const emailInput = z.string().email().max(320);

// Provider bodies may reflect credentials. Preserve the HTTP failure classification, never its raw text.
async function request<T>(ctx: Pick<ActionContext, "http">, req: HttpRequest) {
  try {
    return await ctx.http.request<T>(req);
  } catch (e) {
    if (e instanceof ProviderError) throw new ProviderError(e.kind, `HubSpot request failed (${e.kind})`, e.status, e.retryAfterMs);
    throw e;
  }
}

const cursor = z.string().min(1).max(128);
const contact = z.object({
  id: z.string().min(1),
  properties: z.record(z.string(), z.string().nullable()),
});
const listInput = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  after: cursor.optional(),
  properties: z.array(z.string().min(1).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).min(1).max(50).default(["email", "firstname", "lastname"]),
});
const listOutput = z.object({ contacts: z.array(contact).max(100), nextAfter: cursor.nullable() });
const listResponse = z.object({
  results: z.array(contact).max(100),
  paging: z.object({ next: z.object({ after: cursor }).optional() }).optional(),
});

const listContacts: ActionDef<z.infer<typeof listInput>, z.infer<typeof listOutput>> = {
  id: "hubspot.list_contacts",
  version: 1,
  provider: "hubspot",
  title: "List contacts",
  description: "Read one page of contacts with selected properties. Pass nextAfter as after to read the next page; null means there are no more pages.",
  input: listInput,
  output: listOutput,
  sideEffect: "none",
  requiredScopes: ["crm.objects.contacts.read"],
  async run(ctx, input) {
    const { data } = await request<unknown>(ctx, {
      method: "GET",
      path: "/crm/v3/objects/contacts",
      query: { limit: input.limit, after: input.after, properties: input.properties.join(","), archived: false },
    });
    const parsed = listResponse.safeParse(data);
    // Fixed diagnostics avoid including arbitrary provider data in step errors or logs.
    if (!parsed.success || parsed.data.results.length > input.limit) throw new ProviderError("client", "HubSpot returned an invalid contacts response");
    return { contacts: parsed.data.results, nextAfter: parsed.data.paging?.next?.after ?? null };
  },
};

const provider: ProviderDef = {
  id: "hubspot",
  name: "HubSpot",
  icon: "🧲",
  category: "CRM",
  description: "List, read and upsert contacts and create deals in HubSpot.",
  authType: "api_key",
  apiBase: "https://api.hubapi.com",
  connectFields: [
    { key: "token", label: "Private app token", secret: true, placeholder: "pat-na1-…", help: "Use a private app token with permission to read contacts. Contact and deal writes need their matching write permissions. Live verification is pending." },
  ],
  async identity(ctx) {
    const { data } = await request<unknown>(ctx, { method: "GET", path: "/account-info/v3/details" });
    const parsed = z.object({ portalId: z.number().int().positive().safe() }).safeParse(data);
    if (!parsed.success) throw new ProviderError("client", "HubSpot returned an invalid account identity");
    return { accountId: String(parsed.data.portalId), label: `Portal ${parsed.data.portalId}` };
  },
  actions: [
    listContacts,
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
        const { data } = await request<{
          results: { id: string; properties: { email?: string } }[];
        }>(ctx, {
          method: "POST",
          path: "/crm/v3/objects/contacts/batch/upsert",
          json: {
            inputs: [
              {
                idProperty: "email",
                id: input.email,
                properties: { ...input.properties, email: input.email },
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
        const { data } = await request<{
          id: string;
          properties: Record<string, unknown>;
        }>(ctx, {
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
        const { data } = await request<{ id: string }>(ctx, {
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
