import { z } from "zod";
import { ProviderError, type ActionContext, type ActionDef, type ProviderDef } from "../types";

type GqlCtx = Pick<ActionContext, "http" | "credentials">;

async function gql<T>(ctx: GqlCtx, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await ctx.http.request<{ data?: T; errors?: { message: string }[] }>({
    method: "POST",
    path: "/graphql",
    headers: { authorization: ctx.credentials.token ?? "" },
    json: variables === undefined ? { query } : { query, variables },
  });
  const errors = res.data.errors;
  if (errors?.length) {
    const message = errors[0]!.message;
    throw new ProviderError(/auth|unauthor/i.test(message) ? "auth" : "client", message);
  }
  return res.data.data as T;
}

const teamsOutput = z.object({
  teams: z.array(z.object({ id: z.string(), name: z.string(), key: z.string() })).max(100),
});

const listTeams: ActionDef<Record<string, never>, z.infer<typeof teamsOutput>> = {
  id: "linear.list_teams",
  version: 1,
  provider: "linear",
  title: "List teams",
  description: "List teams in the Linear workspace",
  input: z.object({}).strict(),
  output: teamsOutput,
  sideEffect: "none",
  requiredScopes: ["read"],
  async run(ctx) {
    const data = await gql<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(ctx, "{ teams { nodes { id name key } } }");
    return { teams: data.teams.nodes.slice(0, 100) };
  },
};

const issueInput = z.object({
  teamId: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  description: z.string().max(20_000).default(""),
  priority: z.number().int().min(0).max(4).optional(),
});
const issueOutput = z.object({ id: z.string(), identifier: z.string(), title: z.string(), url: z.string() });

const ISSUE_FRAGMENT = "{ id identifier title url }";

const createIssue: ActionDef<z.infer<typeof issueInput>, z.infer<typeof issueOutput>> = {
  id: "linear.create_issue",
  version: 1,
  provider: "linear",
  title: "Create issue",
  description: "Create an issue in a Linear team",
  input: issueInput,
  output: issueOutput,
  sideEffect: "non_idempotent",
  requiredScopes: ["write"],
  async run(ctx, input) {
    const data = await gql<{ issueCreate: { success: boolean; issue: z.infer<typeof issueOutput> | null } }>(
      ctx,
      `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue ${ISSUE_FRAGMENT} } }`,
      {
        input: {
          teamId: input.teamId,
          title: input.title,
          description: `${input.description}\n\n<!-- flowline:${ctx.idempotencyKey} -->`,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
      },
    );
    if (!data.issueCreate.success || !data.issueCreate.issue) throw new ProviderError("server", "Linear did not create the issue");
    return data.issueCreate.issue;
  },
  async verify(ctx) {
    const data = await gql<{ issues: { nodes: z.infer<typeof issueOutput>[] } }>(
      ctx,
      `query FindIssue($needle: String!) { issues(filter: { description: { contains: $needle } }, first: 5) { nodes ${ISSUE_FRAGMENT} } }`,
      { needle: `flowline:${ctx.idempotencyKey}` },
    );
    const hit = data.issues.nodes[0];
    return hit ? { happened: true, output: hit } : { happened: false };
  },
};

const provider: ProviderDef = {
  id: "linear",
  name: "Linear",
  icon: "📐",
  category: "Project management",
  description: "List teams and create issues in Linear",
  authType: "api_key",
  apiBase: "https://api.linear.app",
  connectFields: [{ key: "token", label: "API key", secret: true, placeholder: "lin_api_…" }],
  async identity(ctx) {
    const data = await gql<{ viewer: { id: string; name: string; email: string } | null }>(ctx, "{ viewer { id name email } }");
    if (!data.viewer) throw new ProviderError("auth", "Linear did not return a viewer for this API key");
    return { accountId: data.viewer.id, label: `${data.viewer.name} <${data.viewer.email}>` };
  },
  actions: [listTeams, createIssue],
  verification: {
    adapter: true,
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
