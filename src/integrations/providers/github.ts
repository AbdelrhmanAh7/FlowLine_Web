import { z } from "zod";
import type { ActionDef, ProviderDef } from "../types";

const GH_HEADERS = { accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

const repoRef = {
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  number: z.number().int().positive(),
};

const prInput = z.object(repoRef);
const prOutput = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.string(),
  merged: z.boolean(),
  user: z.string(),
  head: z.string(),
  base: z.string(),
  body: z.string().nullable(),
});

interface PullRequest {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  user?: { login?: string } | null;
  head?: { ref?: string };
  base?: { ref?: string };
  body: string | null;
}

const getPullRequest: ActionDef<z.infer<typeof prInput>, z.infer<typeof prOutput>> = {
  id: "github.get_pull_request",
  version: 1,
  provider: "github",
  title: "Get pull request",
  description: "Fetch a pull request's state, branches and author",
  input: prInput,
  output: prOutput,
  sideEffect: "none",
  requiredScopes: ["repo"],
  async run(ctx, input) {
    const res = await ctx.http.request<PullRequest>({
      method: "GET",
      path: `/repos/${input.owner}/${input.repo}/pulls/${input.number}`,
      headers: GH_HEADERS,
    });
    const pr = res.data;
    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      user: pr.user?.login ?? "",
      head: pr.head?.ref ?? "",
      base: pr.base?.ref ?? "",
      body: pr.body,
    };
  },
};

const filesInput = z.object(repoRef);
const filesOutput = z.object({
  files: z
    .array(
      z.object({
        filename: z.string(),
        status: z.string(),
        additions: z.number().int(),
        deletions: z.number().int(),
        patch: z.string().optional(),
      }),
    )
    .max(100),
});

type PrFile = z.infer<typeof filesOutput>["files"][number];

const listPrFiles: ActionDef<z.infer<typeof filesInput>, z.infer<typeof filesOutput>> = {
  id: "github.list_pr_files",
  version: 1,
  provider: "github",
  title: "List pull request files",
  description: "List files changed in a pull request",
  input: filesInput,
  output: filesOutput,
  sideEffect: "none",
  requiredScopes: ["repo"],
  async run(ctx, input) {
    const res = await ctx.http.request<PrFile[]>({
      method: "GET",
      path: `/repos/${input.owner}/${input.repo}/pulls/${input.number}/files`,
      query: { per_page: 100 },
      headers: GH_HEADERS,
    });
    return { files: res.data.slice(0, 100) };
  },
};

const commentInput = z.object({
  ...repoRef,
  body: z.string().min(1).max(10_000),
});
const commentOutput = z.object({ id: z.number().int(), url: z.string() });

interface IssueComment {
  id: number;
  html_url: string;
  body?: string | null;
}

function marker(key: string): string {
  return `<!-- flowline:${key} -->`;
}

const createIssueComment: ActionDef<z.infer<typeof commentInput>, z.infer<typeof commentOutput>> = {
  id: "github.create_issue_comment",
  version: 1,
  provider: "github",
  title: "Comment on issue or PR",
  description: "Post a comment on an issue or pull request",
  input: commentInput,
  output: commentOutput,
  sideEffect: "non_idempotent",
  requiredScopes: ["repo"],
  async run(ctx, input) {
    const res = await ctx.http.request<IssueComment>({
      method: "POST",
      path: `/repos/${input.owner}/${input.repo}/issues/${input.number}/comments`,
      headers: GH_HEADERS,
      json: { body: `${input.body}\n\n${marker(ctx.idempotencyKey)}` },
    });
    return { id: res.data.id, url: res.data.html_url };
  },
  async verify(ctx, input) {
    const res = await ctx.http.request<IssueComment[]>({
      method: "GET",
      path: `/repos/${input.owner}/${input.repo}/issues/${input.number}/comments`,
      query: { per_page: 100 },
      headers: GH_HEADERS,
    });
    const hit = res.data.find((c) => c.body?.includes(marker(ctx.idempotencyKey)));
    return hit ? { happened: true, output: { id: hit.id, url: hit.html_url } } : { happened: false };
  },
};

const provider: ProviderDef = {
  id: "github",
  name: "GitHub",
  icon: "🐙",
  category: "Developer tools",
  description: "Read pull requests and comment on issues in GitHub repositories",
  authType: "api_key",
  apiBase: "https://api.github.com",
  oauth: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    revokeUrl: "https://api.github.com/applications/{client_id}/grant",
    scopes: ["repo", "read:user"],
    pkce: true,
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
  },
  connectFields: [{ key: "token", label: "Personal access token", secret: true, placeholder: "ghp_…" }],
  async identity(ctx) {
    const res = await ctx.http.request<{ id: number; login: string }>({ method: "GET", path: "/user", headers: GH_HEADERS });
    return { accountId: String(res.data.id), label: res.data.login };
  },
  actions: [getPullRequest, listPrFiles, createIssueComment],
  verification: {
    adapter: true,
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
