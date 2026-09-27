import { z } from "zod";
import type { ActionDef, ProviderDef } from "../types";

const NOTION_HEADERS = { "Notion-Version": "2022-06-28" };

const queryInput = z.object({
  databaseId: z.string().min(1).max(64),
  filter: z.record(z.string(), z.unknown()).optional(),
  sorts: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
});
const queryOutput = z.object({
  results: z.array(z.object({ id: z.string(), properties: z.record(z.string(), z.unknown()) })).max(100),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

const queryDatabase: ActionDef<z.infer<typeof queryInput>, z.infer<typeof queryOutput>> = {
  id: "notion.query_database",
  version: 1,
  provider: "notion",
  title: "Query database",
  description: "Query a Notion database with optional filter and sorts",
  input: queryInput,
  output: queryOutput,
  sideEffect: "none",
  requiredScopes: ["read_content"],
  async run(ctx, input) {
    const res = await ctx.http.request<z.infer<typeof queryOutput>>({
      method: "POST",
      path: `/v1/databases/${input.databaseId}/query`,
      headers: NOTION_HEADERS,
      json: {
        ...(input.filter ? { filter: input.filter } : {}),
        ...(input.sorts ? { sorts: input.sorts } : {}),
        page_size: input.pageSize,
      },
    });
    return { results: res.data.results.slice(0, 100), has_more: res.data.has_more, next_cursor: res.data.next_cursor };
  },
};

const pageInput = z
  .object({
    parentDatabaseId: z.string().max(64).optional(),
    parentPageId: z.string().max(64).optional(),
    properties: z.record(z.string(), z.unknown()),
    children: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
  })
  .refine((v) => (v.parentDatabaseId ? 1 : 0) + (v.parentPageId ? 1 : 0) === 1, {
    message: "Exactly one of parentDatabaseId or parentPageId is required",
  });
const pageOutput = z.object({ id: z.string(), url: z.string() });

const createPage: ActionDef<z.infer<typeof pageInput>, z.infer<typeof pageOutput>> = {
  id: "notion.create_page",
  version: 1,
  provider: "notion",
  title: "Create page",
  description: "Create a page inside a database or another page",
  input: pageInput,
  output: pageOutput,
  sideEffect: "non_idempotent",
  requiredScopes: ["insert_content"],
  async run(ctx, input) {
    const parent = input.parentDatabaseId ? { database_id: input.parentDatabaseId } : { page_id: input.parentPageId as string };
    const res = await ctx.http.request<{ id: string; url: string }>({
      method: "POST",
      path: "/v1/pages",
      headers: NOTION_HEADERS,
      json: { parent, properties: input.properties, ...(input.children ? { children: input.children } : {}) },
    });
    return { id: res.data.id, url: res.data.url };
  },
};

const provider: ProviderDef = {
  id: "notion",
  name: "Notion",
  icon: "📝",
  category: "Docs",
  description: "Query databases and create pages in a Notion workspace",
  authType: "api_key",
  apiBase: "https://api.notion.com",
  connectFields: [{ key: "token", label: "Integration token", secret: true, placeholder: "ntn_… or secret_…" }],
  async identity(ctx) {
    const res = await ctx.http.request<{ id: string; name?: string | null }>({
      method: "GET",
      path: "/v1/users/me",
      headers: NOTION_HEADERS,
    });
    return { accountId: res.data.id, label: res.data.name ?? res.data.id };
  },
  actions: [queryDatabase, createPage],
  verification: {
    adapter: true,
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
