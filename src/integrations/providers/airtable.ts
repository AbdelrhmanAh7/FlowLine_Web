import { z } from "zod";
import type { ProviderDef } from "../types";

const tableRef = z.object({
  baseId: z.string().max(64),
  table: z.string().max(128),
});

const recordOutput = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

const tablePath = (baseId: string, table: string) => `/v0/${baseId}/${encodeURIComponent(table)}`;

const provider: ProviderDef = {
  id: "airtable",
  name: "Airtable",
  icon: "🗃️",
  category: "Database",
  description: "List, upsert and create records in Airtable tables.",
  authType: "api_key",
  apiBase: "https://api.airtable.com",
  connectFields: [
    { key: "token", label: "Personal access token", secret: true, placeholder: "pat…" },
  ],
  async identity(ctx) {
    const { data } = await ctx.http.request<{ id: string; email?: string }>({
      method: "GET",
      path: "/v0/meta/whoami",
    });
    return { accountId: data.id, label: data.email ?? data.id };
  },
  actions: [
    {
      id: "airtable.list_records",
      version: 1,
      provider: "airtable",
      title: "List records",
      description: "List records in a table, optionally filtered by view or formula.",
      input: tableRef.extend({
        maxRecords: z.number().int().min(1).max(100).default(100),
        view: z.string().max(128).optional(),
        filterByFormula: z.string().max(1000).optional(),
      }),
      output: z.object({ records: z.array(recordOutput).max(100) }),
      sideEffect: "none",
      requiredScopes: ["data.records:read"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          records?: { id: string; fields: Record<string, unknown> }[];
        }>({
          method: "GET",
          path: tablePath(input.baseId, input.table),
          query: {
            maxRecords: input.maxRecords,
            view: input.view,
            filterByFormula: input.filterByFormula,
          },
        });
        return { records: data.records ?? [] };
      },
    },
    {
      id: "airtable.upsert_record",
      version: 1,
      provider: "airtable",
      title: "Upsert record",
      description: "Create or update a record, matched on the given fields.",
      input: tableRef
        .extend({
          fieldsToMergeOn: z.array(z.string().max(128)).min(1).max(10),
          fields: z.record(z.string(), z.unknown()),
        })
        .refine((v) => v.fieldsToMergeOn.every((k) => k in v.fields), {
          message: "Every fieldsToMergeOn key must exist in fields",
        }),
      output: z.object({ records: z.array(recordOutput).max(10) }),
      sideEffect: "idempotent",
      requiredScopes: ["data.records:write"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          records: { id: string; fields: Record<string, unknown> }[];
        }>({
          method: "PATCH",
          path: tablePath(input.baseId, input.table),
          json: {
            performUpsert: { fieldsToMergeOn: input.fieldsToMergeOn },
            typecast: true,
            records: [{ fields: input.fields }],
          },
        });
        return { records: data.records };
      },
    },
    {
      id: "airtable.create_record",
      version: 1,
      provider: "airtable",
      title: "Create record",
      description: "Create a new record. Repeating this creates a duplicate, so a lost response is reviewed by a human.",
      input: tableRef.extend({
        fields: z.record(z.string(), z.unknown()),
      }),
      output: z.object({ id: z.string() }),
      sideEffect: "non_idempotent",
      requiredScopes: ["data.records:write"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          records: { id: string }[];
        }>({
          method: "POST",
          path: tablePath(input.baseId, input.table),
          json: { typecast: true, records: [{ fields: input.fields }] },
        });
        return { id: data.records[0].id };
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
