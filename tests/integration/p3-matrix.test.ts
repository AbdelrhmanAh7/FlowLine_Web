/**
 * Capability × role matrix, exercised through the REAL route handlers with REAL better-auth sessions.
 *
 * For every capability in `CAPABILITIES` we call the route(s) that enforce it as an owner, an editor,
 * a viewer and a non-member (another workspace's owner), and assert:
 *   allowed  ⇔ the matrix says so → a 2xx (or a documented non-permission 4xx, see `okStatuses`)
 *   denied member                → 403
 *   non-member                   → 404 (existence is never leaked across tenants)
 *   never                        → 401 or 5xx
 *
 * The only mock is `next/headers` (there is no Next request context under vitest); the session cookie
 * itself is a real better-auth session row, signed the same way the SSO callback signs it, and it is
 * resolved by `auth.api.getSession` exactly as in production.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => {
    throw new Error("cookies() is not used by API routes");
  },
}));

import { POST as agentRunCancelPOST } from "@/app/api/agent-runs/[rid]/cancel/route";
import { GET as agentRunGET } from "@/app/api/agent-runs/[rid]/route";
import { DELETE as agentDELETE, GET as agentGET, PUT as agentPUT } from "@/app/api/agents/[aid]/route";
import { GET as agentRunsGET, POST as agentRunsPOST } from "@/app/api/agents/[aid]/runs/route";
import { POST as approvalDecidePOST } from "@/app/api/approvals/[aid]/decide/route";
import { DELETE as connectionDELETE, GET as connectionGET, PATCH as connectionPATCH } from "@/app/api/connections/[cid]/route";
import { POST as copilotDecidePOST } from "@/app/api/flows/[fid]/copilot/[pid]/route";
import { GET as copilotGET, POST as copilotPOST } from "@/app/api/flows/[fid]/copilot/route";
import { DELETE as publishDELETE, GET as publishGET, POST as publishPOST } from "@/app/api/flows/[fid]/publish/route";
import { DELETE as flowDELETE, GET as flowGET, PUT as flowPUT } from "@/app/api/flows/[fid]/route";
import { GET as flowRunsGET, POST as flowRunsPOST } from "@/app/api/flows/[fid]/runs/route";
import { POST as sharePOST } from "@/app/api/flows/[fid]/share/route";
import { POST as restorePOST } from "@/app/api/flows/[fid]/versions/[vid]/restore/route";
import { GET as versionGET } from "@/app/api/flows/[fid]/versions/[vid]/route";
import { GET as versionsGET } from "@/app/api/flows/[fid]/versions/route";
import { POST as runCancelPOST } from "@/app/api/runs/[rid]/cancel/route";
import { GET as rerunPreviewGET } from "@/app/api/runs/[rid]/rerun-preview/route";
import { POST as rerunPOST } from "@/app/api/runs/[rid]/rerun/route";
import { GET as runGET } from "@/app/api/runs/[rid]/route";
import { GET as wsAgentsGET, POST as wsAgentsPOST } from "@/app/api/workspaces/[wid]/agents/route";
import { DELETE as apiKeyDELETE } from "@/app/api/workspaces/[wid]/api-keys/[kid]/route";
import { GET as apiKeysGET, POST as apiKeysPOST } from "@/app/api/workspaces/[wid]/api-keys/route";
import { GET as wsApprovalsGET } from "@/app/api/workspaces/[wid]/approvals/route";
import { GET as auditGET } from "@/app/api/workspaces/[wid]/audit/route";
import { POST as billingCancelPOST } from "@/app/api/workspaces/[wid]/billing/cancel/route";
import { POST as billingChangePOST } from "@/app/api/workspaces/[wid]/billing/change/route";
import { POST as billingCheckoutPOST } from "@/app/api/workspaces/[wid]/billing/checkout/route";
import { POST as billingReconcilePOST } from "@/app/api/workspaces/[wid]/billing/reconcile/route";
import { GET as billingGET } from "@/app/api/workspaces/[wid]/billing/route";
import { GET as wsConnectionsGET } from "@/app/api/workspaces/[wid]/connections/route";
import { GET as filesGET, POST as filesPOST } from "@/app/api/workspaces/[wid]/files/route";
import { GET as wsFlowsGET, POST as wsFlowsPOST } from "@/app/api/workspaces/[wid]/flows/route";
import { DELETE as inviteDELETE } from "@/app/api/workspaces/[wid]/invites/[iid]/route";
import { GET as invitesGET, POST as invitesPOST } from "@/app/api/workspaces/[wid]/invites/route";
import { DELETE as knowledgeSourceDELETE, PATCH as knowledgeSourcePATCH } from "@/app/api/workspaces/[wid]/knowledge/[sid]/route";
import { GET as knowledgeGET, POST as knowledgePOST } from "@/app/api/workspaces/[wid]/knowledge/route";
import { GET as knowledgeSearchGET } from "@/app/api/workspaces/[wid]/knowledge/search/route";
import { DELETE as memberDELETE, PATCH as memberPATCH } from "@/app/api/workspaces/[wid]/members/[uid]/route";
import { GET as membersGET } from "@/app/api/workspaces/[wid]/members/route";
import { GET as overviewGET } from "@/app/api/workspaces/[wid]/overview/route";
import { GET as workspaceGET, PATCH as workspacePATCH } from "@/app/api/workspaces/[wid]/route";
import { GET as wsRunsGET } from "@/app/api/workspaces/[wid]/runs/route";
import { GET as ssoGET, PUT as ssoPUT } from "@/app/api/workspaces/[wid]/sso/route";
import { GET as oauthAppsGET } from "@/app/api/workspaces/[wid]/oauth-apps/route";
import { GET as usageGET } from "@/app/api/workspaces/[wid]/usage/route";
import { DELETE as aiConnDELETE } from "@/app/api/workspaces/[wid]/ai/connections/[cid]/route";
import { POST as aiConnsPOST } from "@/app/api/workspaces/[wid]/ai/connections/route";
import { PUT as aiDefaultPUT } from "@/app/api/workspaces/[wid]/ai/default-route/route";
import { GET as aiModelsGET } from "@/app/api/workspaces/[wid]/ai/models/route";
import { connectAi, fakeKey, useAiDouble } from "./ai-helpers";
import { db, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/server/access";
import { createAgent, startAgentRun } from "@/server/agents";
import { createApiKey } from "@/server/apikeys";
import { createFlow, saveFlow } from "@/server/flows";
import { addSource } from "@/server/knowledge";
import { createInvite } from "@/server/members";
import { ALL_CAPABILITIES, CAPABILITIES, can, type Capability, type Role } from "@/server/permissions";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { startFakeProviders } from "../../e2e/fakes/provider-server";
import { addMember, closeDb, makeUser, unique } from "./helpers";

/* ───────────── session plumbing ───────────── */

interface Actor {
  label: string;
  user: CurrentUser;
  cookie: string;
}

/** A real better-auth session row + the signed cookie the SSO callback would set. */
async function signIn(label: string, user: CurrentUser): Promise<Actor> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const c = await ssoSessionCookie(session.token);
  return { label, user, cookie: `${c.name}=${encodeURIComponent(c.value)}` };
}

function actAs(actor: Actor | null) {
  sessionHolder.headers = new Headers(actor ? { cookie: actor.cookie } : {});
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

interface Call {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  handler: unknown;
  path: string;
  params: Record<string, string>;
  body?: unknown;
  /** Raw body (multipart) — used instead of `body`. */
  raw?: BodyInit;
}

async function invoke(actor: Actor | null, c: Call) {
  actAs(actor);
  const init: RequestInit = { method: c.method };
  if (c.raw !== undefined) init.body = c.raw;
  else if (c.body !== undefined) {
    init.body = JSON.stringify(c.body);
    init.headers = { "content-type": "application/json" };
  }
  // No cookie header on the Request itself: the session travels through next/headers (mocked above),
  // so the CSRF check (which only looks at cookie-bearing requests) is exercised separately in p3-access.
  const res = await (c.handler as Handler)(new Request(`http://localhost:3100${c.path}`, init), { params: Promise.resolve(c.params) });
  let body: unknown = null;
  try {
    body = await res.clone().json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

/* ───────────── fixtures ───────────── */

const graph = (): FlowGraph => ({
  nodes: [
    {
      id: "t",
      type: "trigger.manual",
      position: { x: 0, y: 0 },
      data: { label: "Start", config: { samplePayload: '{ "n": 2 }' } },
    },
    {
      id: "x",
      type: "transform.json",
      position: { x: 200, y: 0 },
      data: { label: "Double", config: { expression: '{ "v": n * 2 }' } },
    },
    {
      id: "o",
      type: "output",
      position: { x: 400, y: 0 },
      data: { label: "Out", config: { key: "r", expression: "" } },
    },
  ],
  edges: [
    { id: "e1", source: "t", target: "x" },
    { id: "e2", source: "x", target: "o" },
  ],
});

const limits = () => ({
  maxSteps: 4,
  maxToolCalls: 4,
  maxCostMicros: null,
  timeoutMs: 30_000,
});

let fakeAi: Awaited<ReturnType<typeof startFakeAi>>;
let fakeProviders: Awaited<ReturnType<typeof startFakeProviders>>;
let issuer: string;
const prevEnv = { ...process.env };

interface Tenant {
  owner: Actor;
  editor: Actor;
  viewer: Actor;
  ws: { id: string; slug: string };
}

let A: Tenant;
let B: Tenant; // B.owner is the non-member for every A object
let nobody: Actor; // signed in, member of nothing

async function tenant(name: string): Promise<Tenant> {
  const ownerUser = await makeUser(`${name}-own`);
  const editorUser = await makeUser(`${name}-ed`);
  const viewerUser = await makeUser(`${name}-vw`);
  const ws = await createWorkspace(ownerUser, unique(name));
  await addMember(ws.id, editorUser.id, "editor");
  await addMember(ws.id, viewerUser.id, "viewer");
  await db.update(schema.workspace).set({ maxQueuedRuns: 500, maxMonthlyExecutions: null }).where(eq(schema.workspace.id, ws.id));
  // Copilot (flow.edit probe) runs on the workspace AI connection; editors may use it here.
  await connectAi(ownerUser, ws.id, { useRoles: ["owner", "editor"] });
  return {
    owner: await signIn(`${name} owner`, ownerUser),
    editor: await signIn(`${name} editor`, editorUser),
    viewer: await signIn(`${name} viewer`, viewerUser),
    ws: { id: ws.id, slug: ws.slug },
  };
}

/* Fresh objects per call: several routes are destructive, so every actor gets its own target. */

async function freshFlow(t: Tenant, opts: { publish?: boolean } = {}) {
  const flow = await createFlow(t.owner.user, t.ws.id, {
    name: unique("Flow"),
  });
  const saved = await saveFlow(t.owner.user, flow.id, {
    baseRevision: 1,
    graph: graph(),
    createVersion: true,
  });
  if (opts.publish) await publishFlow(t.owner.user, flow.id);
  const [row] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
  return { id: flow.id, revision: row!.revision, versionId: saved.version!.id };
}

async function freshRun(t: Tenant) {
  const f = await freshFlow(t);
  const run = await enqueueRun(t.owner.user, f.id);
  return { flow: f, run };
}

async function freshApproval(t: Tenant) {
  const { run } = await freshRun(t);
  await db.update(schema.run).set({ status: "waiting_approval" }).where(eq(schema.run.id, run.id));
  const [ap] = await db
    .insert(schema.approval)
    .values({
      workspaceId: t.ws.id,
      runId: run.id,
      flowVersionId: run.flowVersionId,
      nodeId: "x",
      kind: "approval",
      actionId: "gmail.send",
      argsHash: "h",
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning();
  return ap!;
}

async function freshConnection(t: Tenant, createdBy: CurrentUser = t.owner.user) {
  const [c] = await db
    .insert(schema.connection)
    .values({
      workspaceId: t.ws.id,
      provider: "slack",
      label: unique("conn"),
      authType: "token",
      accountId: unique("acct"),
      accountLabel: "Acme",
      secretEnc: "not-a-real-secret-ciphertext",
      keyId: "k1",
      createdBy: createdBy.id,
    })
    .returning();
  return c!;
}

async function freshAgent(t: Tenant) {
  return createAgent(t.owner.user, t.ws.id, {
    name: unique("Agent"),
    instructions: "Be brief.",
    limits: limits(),
  });
}

async function freshAgentRun(t: Tenant) {
  const agent = await freshAgent(t);
  const run = await startAgentRun({
    agentId: agent.id,
    message: "hello",
    actingUser: t.owner.user,
    actor: { kind: "user", userId: t.owner.user.id, label: t.owner.user.email },
  });
  return { agent, run };
}

async function freshSource(t: Tenant) {
  return addSource(db, t.owner.user, t.ws.id, {
    name: unique("doc"),
    bytes: Buffer.from("Refunds take 5 days.", "utf8"),
    mime: "text/plain",
    kind: "text",
  });
}

async function freshProposal(t: Tenant) {
  const f = await freshFlow(t);
  const [p] = await db
    .insert(schema.copilotProposal)
    .values({
      workspaceId: t.ws.id,
      flowId: f.id,
      baseRevision: f.revision,
      request: "add a step",
      proposedGraph: graph(),
      diff: { added: [], removed: [], changed: [] },
      status: "proposed",
      issues: [],
    })
    .returning();
  return { flow: f, proposal: p! };
}

async function freshApiKey(t: Tenant) {
  return (
    await createApiKey(t.owner.user, t.ws.id, {
      name: unique("key"),
      mode: "test",
      scopes: ["runs:read"],
    })
  ).apiKey;
}

async function freshInvite(t: Tenant) {
  return (
    await createInvite(t.owner.user, t.ws.id, {
      email: `${unique("invitee")}@flowline-test.local`,
      role: "viewer",
    })
  ).invite;
}

/** A disposable extra member (so role changes / removals never touch the fixed actors). */
async function freshMember(t: Tenant) {
  const u = await makeUser("extra");
  await addMember(t.ws.id, u.id, "viewer");
  return u;
}

function multipart(name: string, text: string) {
  const fd = new FormData();
  fd.append("file", new Blob([text], { type: "text/plain" }), name);
  return fd;
}

/* ───────────── the table: capability → routes ───────────── */

interface Probe {
  /** Route name as it appears in the report table. */
  route: string;
  /** Builds a fresh call for the given actor (fresh objects per actor so destructive calls don't interfere). */
  call: (actor: Actor) => Promise<Call>;
  /**
   * Statuses accepted for an ALLOWED role besides 2xx. Each one is a business-rule outcome that can only
   * be reached AFTER the permission check passed (documented in the report). Never 401/403/404/5xx.
   */
  okStatuses?: number[];
}

/** Capabilities whose routes enforce them only through the default `viewer` need (matrix ≡ every member). */
const IMPLICIT_VIEWER_CAPS: Capability[] = ["usage.view", "member.view"];

/** Capabilities that no route enforces (candidate dead capability — reported, not skipped). */
const NO_ROUTE_CAPS: Capability[] = ["integration.use"];

const TABLE: Record<Capability, Probe[]> = {
  "flow.view": [
    {
      route: "GET /api/flows/[fid]",
      call: async () => ({
        method: "GET",
        handler: flowGET,
        path: "/api/flows/x",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
    {
      route: "GET /api/flows/[fid]/versions",
      call: async () => ({
        method: "GET",
        handler: versionsGET,
        path: "/api/flows/x/versions",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
    {
      route: "GET /api/flows/[fid]/versions/[vid]",
      call: async () => {
        const f = await freshFlow(A);
        return {
          method: "GET",
          handler: versionGET,
          path: "/api/flows/x/versions/y",
          params: { fid: f.id, vid: f.versionId },
        };
      },
    },
    {
      route: "GET /api/flows/[fid]/runs",
      call: async () => ({
        method: "GET",
        handler: flowRunsGET,
        path: "/api/flows/x/runs",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
    {
      route: "GET /api/flows/[fid]/publish",
      call: async () => ({
        method: "GET",
        handler: publishGET,
        path: "/api/flows/x/publish",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
    {
      route: "GET /api/runs/[rid]",
      call: async () => ({
        method: "GET",
        handler: runGET,
        path: "/api/runs/x",
        params: { rid: (await freshRun(A)).run.id },
      }),
    },
    {
      route: "GET /api/runs/[rid]/rerun-preview",
      call: async () => ({
        method: "GET",
        handler: rerunPreviewGET,
        path: "/api/runs/x/rerun-preview?fromNodeId=x",
        params: { rid: (await freshRun(A)).run.id },
      }),
      okStatuses: [400, 409],
    },
    {
      route: "GET /api/workspaces/[wid]/flows",
      call: async () => ({
        method: "GET",
        handler: wsFlowsGET,
        path: "/api/workspaces/x/flows",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/runs",
      call: async () => ({
        method: "GET",
        handler: wsRunsGET,
        path: "/api/workspaces/x/runs",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/overview",
      call: async () => ({
        method: "GET",
        handler: overviewGET,
        path: "/api/workspaces/x/overview",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]",
      call: async () => ({
        method: "GET",
        handler: workspaceGET,
        path: "/api/workspaces/x",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/approvals",
      call: async () => ({
        method: "GET",
        handler: wsApprovalsGET,
        path: "/api/workspaces/x/approvals",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/files",
      call: async () => ({
        method: "GET",
        handler: filesGET,
        path: "/api/workspaces/x/files",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/flows/[fid]/copilot",
      call: async () => ({
        method: "GET",
        handler: copilotGET,
        path: "/api/flows/x/copilot",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
  ],
  "flow.edit": [
    {
      route: "PUT /api/flows/[fid]",
      call: async () => {
        const f = await freshFlow(A);
        return {
          method: "PUT",
          handler: flowPUT,
          path: "/api/flows/x",
          params: { fid: f.id },
          body: { baseRevision: f.revision, name: unique("Renamed") },
        };
      },
    },
    {
      route: "POST /api/workspaces/[wid]/flows",
      call: async () => ({
        method: "POST",
        handler: wsFlowsPOST,
        path: "/api/workspaces/x/flows",
        params: { wid: A.ws.id },
        body: { name: unique("New") },
      }),
    },
    {
      route: "POST /api/flows/[fid]/versions/[vid]/restore (publish:false)",
      call: async () => {
        const f = await freshFlow(A);
        return {
          method: "POST",
          handler: restorePOST,
          path: "/api/flows/x/versions/y/restore",
          params: { fid: f.id, vid: f.versionId },
          body: { baseRevision: f.revision, publish: false },
        };
      },
    },
    {
      route: "POST /api/flows/[fid]/copilot (propose)",
      call: async () => ({
        method: "POST",
        handler: copilotPOST,
        path: "/api/flows/x/copilot",
        params: { fid: (await freshFlow(A)).id },
        body: { request: "add a condition before the output" },
      }),
    },
    {
      route: "POST /api/flows/[fid]/copilot/[pid] (decide)",
      call: async () => {
        const { flow, proposal } = await freshProposal(A);
        return {
          method: "POST",
          handler: copilotDecidePOST,
          path: "/api/flows/x/copilot/y",
          params: { fid: flow.id, pid: proposal.id },
          body: { decision: "reject" },
        };
      },
    },
    {
      route: "POST /api/workspaces/[wid]/files",
      call: async () => ({
        method: "POST",
        handler: filesPOST,
        path: "/api/workspaces/x/files",
        params: { wid: A.ws.id },
        raw: multipart("notes.txt", "hello"),
      }),
    },
  ],
  "flow.run": [
    {
      route: "POST /api/flows/[fid]/runs",
      call: async () => ({
        method: "POST",
        handler: flowRunsPOST,
        path: "/api/flows/x/runs",
        params: { fid: (await freshFlow(A)).id },
        body: { input: { n: 1 } },
      }),
    },
    {
      route: "POST /api/runs/[rid]/cancel",
      call: async () => ({
        method: "POST",
        handler: runCancelPOST,
        path: "/api/runs/x/cancel",
        params: { rid: (await freshRun(A)).run.id },
      }),
    },
    // A queued run can't be re-run from a step yet: 409 is the business answer once the permission check passed.
    {
      route: "POST /api/runs/[rid]/rerun",
      call: async () => ({
        method: "POST",
        handler: rerunPOST,
        path: "/api/runs/x/rerun",
        params: { rid: (await freshRun(A)).run.id },
        body: { fromNodeId: "x" },
      }),
      okStatuses: [400, 409],
    },
  ],
  "flow.publish": [
    {
      route: "POST /api/flows/[fid]/publish",
      call: async () => ({
        method: "POST",
        handler: publishPOST,
        path: "/api/flows/x/publish",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
    {
      route: "DELETE /api/flows/[fid]/publish",
      call: async () => ({
        method: "DELETE",
        handler: publishDELETE,
        path: "/api/flows/x/publish",
        params: { fid: (await freshFlow(A, { publish: true })).id },
      }),
    },
    {
      route: "POST /api/flows/[fid]/versions/[vid]/restore (publish:true)",
      call: async () => {
        const f = await freshFlow(A);
        return {
          method: "POST",
          handler: restorePOST,
          path: "/api/flows/x/versions/y/restore",
          params: { fid: f.id, vid: f.versionId },
          body: { baseRevision: f.revision, publish: true },
        };
      },
    },
  ],
  "flow.share": [
    // Sharing into the same workspace is a plain copy; it needs flow.share on the source and flow.edit on the target.
    {
      route: "POST /api/flows/[fid]/share",
      call: async () => ({
        method: "POST",
        handler: sharePOST,
        path: "/api/flows/x/share",
        params: { fid: (await freshFlow(A)).id },
        body: { targetWorkspaceId: A.ws.id },
      }),
    },
  ],
  "flow.delete": [
    {
      route: "DELETE /api/flows/[fid]",
      call: async () => ({
        method: "DELETE",
        handler: flowDELETE,
        path: "/api/flows/x",
        params: { fid: (await freshFlow(A)).id },
      }),
    },
  ],
  "approval.decide": [
    {
      route: "POST /api/approvals/[aid]/decide",
      call: async () => ({
        method: "POST",
        handler: approvalDecidePOST,
        path: "/api/approvals/x/decide",
        params: { aid: (await freshApproval(A)).id },
        body: { decision: "approve" },
      }),
    },
  ],
  "integration.use": [],
  "integration.manage": [
    {
      route: "PATCH /api/connections/[cid] (visibility)",
      // The connection is created by the calling member (only its creator may change visibility — a separate rule).
      call: async (actor) => ({
        method: "PATCH",
        handler: connectionPATCH,
        path: "/api/connections/x",
        params: { cid: (await freshConnection(A, actor.user)).id },
        body: { visibility: "private" },
      }),
    },
    {
      route: "DELETE /api/connections/[cid]",
      call: async () => ({
        method: "DELETE",
        handler: connectionDELETE,
        path: "/api/connections/x",
        params: { cid: (await freshConnection(A)).id },
      }),
    },
    // POST /api/workspaces/[wid]/connections verifies credentials with the provider; the allowed path is
    // covered by the p2/p3 connection tests with the fake provider (the permission check is the same helper).
  ],
  "knowledge.view": [
    {
      route: "GET /api/workspaces/[wid]/knowledge",
      call: async () => ({
        method: "GET",
        handler: knowledgeGET,
        path: "/api/workspaces/x/knowledge",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/knowledge/search",
      call: async () => ({
        method: "GET",
        handler: knowledgeSearchGET,
        path: "/api/workspaces/x/knowledge/search?q=refunds",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "knowledge.manage": [
    {
      route: "POST /api/workspaces/[wid]/knowledge",
      call: async () => ({
        method: "POST",
        handler: knowledgePOST,
        path: "/api/workspaces/x/knowledge",
        params: { wid: A.ws.id },
        body: { name: unique("doc"), text: "Payment terms: net 30." },
      }),
    },
    {
      route: "PATCH /api/workspaces/[wid]/knowledge/[sid]",
      call: async () => ({
        method: "PATCH",
        handler: knowledgeSourcePATCH,
        path: "/api/workspaces/x/knowledge/y",
        params: { wid: A.ws.id, sid: (await freshSource(A)).id },
        body: { enabled: false },
      }),
    },
    {
      route: "DELETE /api/workspaces/[wid]/knowledge/[sid]",
      call: async () => ({
        method: "DELETE",
        handler: knowledgeSourceDELETE,
        path: "/api/workspaces/x/knowledge/y",
        params: { wid: A.ws.id, sid: (await freshSource(A)).id },
      }),
    },
  ],
  "agent.view": [
    {
      route: "GET /api/workspaces/[wid]/agents",
      call: async () => ({
        method: "GET",
        handler: wsAgentsGET,
        path: "/api/workspaces/x/agents",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/agents/[aid]",
      call: async () => ({
        method: "GET",
        handler: agentGET,
        path: "/api/agents/x",
        params: { aid: (await freshAgent(A)).id },
      }),
    },
    {
      route: "GET /api/agents/[aid]/runs",
      call: async () => ({
        method: "GET",
        handler: agentRunsGET,
        path: "/api/agents/x/runs",
        params: { aid: (await freshAgent(A)).id },
      }),
    },
    {
      route: "GET /api/agent-runs/[rid]",
      call: async () => ({
        method: "GET",
        handler: agentRunGET,
        path: "/api/agent-runs/x",
        params: { rid: (await freshAgentRun(A)).run.id },
      }),
    },
  ],
  "agent.edit": [
    {
      route: "POST /api/workspaces/[wid]/agents",
      call: async () => ({
        method: "POST",
        handler: wsAgentsPOST,
        path: "/api/workspaces/x/agents",
        params: { wid: A.ws.id },
        body: {
          name: unique("Agent"),
          instructions: "Be brief.",
          limits: limits(),
        },
      }),
    },
    {
      route: "PUT /api/agents/[aid]",
      call: async () => ({
        method: "PUT",
        handler: agentPUT,
        path: "/api/agents/x",
        params: { aid: (await freshAgent(A)).id },
        body: {
          name: unique("Agent2"),
          instructions: "Be briefer.",
          limits: limits(),
        },
      }),
    },
    {
      route: "DELETE /api/agents/[aid]",
      call: async () => ({
        method: "DELETE",
        handler: agentDELETE,
        path: "/api/agents/x",
        params: { aid: (await freshAgent(A)).id },
      }),
    },
  ],
  "agent.run": [
    {
      route: "POST /api/agents/[aid]/runs",
      call: async () => ({
        method: "POST",
        handler: agentRunsPOST,
        path: "/api/agents/x/runs",
        params: { aid: (await freshAgent(A)).id },
        body: { message: "hello" },
      }),
    },
    {
      route: "POST /api/agent-runs/[rid]/cancel",
      call: async () => ({
        method: "POST",
        handler: agentRunCancelPOST,
        path: "/api/agent-runs/x/cancel",
        params: { rid: (await freshAgentRun(A)).run.id },
      }),
    },
  ],
  "usage.view": [
    {
      route: "GET /api/workspaces/[wid]/usage",
      call: async () => ({
        method: "GET",
        handler: usageGET,
        path: "/api/workspaces/x/usage",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "member.view": [
    {
      route: "GET /api/connections/[cid] (public projection)",
      call: async () => ({
        method: "GET",
        handler: connectionGET,
        path: "/api/connections/x",
        params: { cid: (await freshConnection(A)).id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/members",
      call: async () => ({
        method: "GET",
        handler: membersGET,
        path: "/api/workspaces/x/members",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "GET /api/workspaces/[wid]/connections",
      call: async () => ({
        method: "GET",
        handler: wsConnectionsGET,
        path: "/api/workspaces/x/connections",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "member.manage": [
    {
      route: "GET /api/workspaces/[wid]/invites",
      call: async () => ({
        method: "GET",
        handler: invitesGET,
        path: "/api/workspaces/x/invites",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "POST /api/workspaces/[wid]/invites",
      call: async () => ({
        method: "POST",
        handler: invitesPOST,
        path: "/api/workspaces/x/invites",
        params: { wid: A.ws.id },
        body: { email: `${unique("nv")}@flowline-test.local`, role: "viewer" },
      }),
    },
    {
      route: "DELETE /api/workspaces/[wid]/invites/[iid]",
      call: async () => ({
        method: "DELETE",
        handler: inviteDELETE,
        path: "/api/workspaces/x/invites/y",
        params: { wid: A.ws.id, iid: (await freshInvite(A)).id },
      }),
    },
    {
      route: "PATCH /api/workspaces/[wid]/members/[uid] (role change)",
      call: async () => ({
        method: "PATCH",
        handler: memberPATCH,
        path: "/api/workspaces/x/members/y",
        params: { wid: A.ws.id, uid: (await freshMember(A)).id },
        body: { role: "editor" },
      }),
    },
    {
      route: "DELETE /api/workspaces/[wid]/members/[uid] (remove)",
      call: async () => ({
        method: "DELETE",
        handler: memberDELETE,
        path: "/api/workspaces/x/members/y",
        params: { wid: A.ws.id, uid: (await freshMember(A)).id },
      }),
    },
  ],
  "apikey.manage": [
    {
      route: "GET /api/workspaces/[wid]/api-keys",
      call: async () => ({
        method: "GET",
        handler: apiKeysGET,
        path: "/api/workspaces/x/api-keys",
        params: { wid: A.ws.id },
      }),
    },
    {
      route: "POST /api/workspaces/[wid]/api-keys",
      call: async () => ({
        method: "POST",
        handler: apiKeysPOST,
        path: "/api/workspaces/x/api-keys",
        params: { wid: A.ws.id },
        body: { name: unique("k"), mode: "test", scopes: ["runs:read"] },
      }),
    },
    {
      route: "DELETE /api/workspaces/[wid]/api-keys/[kid]",
      call: async () => ({
        method: "DELETE",
        handler: apiKeyDELETE,
        path: "/api/workspaces/x/api-keys/y",
        params: { wid: A.ws.id, kid: (await freshApiKey(A)).id },
      }),
    },
  ],
  "billing.view": [
    {
      route: "GET /api/workspaces/[wid]/billing",
      call: async () => ({
        method: "GET",
        handler: billingGET,
        path: "/api/workspaces/x/billing",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "billing.manage": [
    // Billing isn't configured in the test env: after the permission check the service answers 400 BILLING_NOT_CONFIGURED.
    {
      route: "POST /api/workspaces/[wid]/billing/checkout",
      call: async () => ({
        method: "POST",
        handler: billingCheckoutPOST,
        path: "/api/workspaces/x/billing/checkout",
        params: { wid: A.ws.id },
        body: { planId: "pro" },
      }),
      okStatuses: [400],
    },
    {
      route: "POST /api/workspaces/[wid]/billing/change",
      call: async () => ({
        method: "POST",
        handler: billingChangePOST,
        path: "/api/workspaces/x/billing/change",
        params: { wid: A.ws.id },
        body: { planId: "pro" },
      }),
      okStatuses: [400],
    },
    {
      route: "POST /api/workspaces/[wid]/billing/cancel",
      call: async () => ({
        method: "POST",
        handler: billingCancelPOST,
        path: "/api/workspaces/x/billing/cancel",
        params: { wid: A.ws.id },
        body: { atPeriodEnd: true },
      }),
      okStatuses: [400],
    },
    {
      route: "POST /api/workspaces/[wid]/billing/reconcile",
      call: async () => ({
        method: "POST",
        handler: billingReconcilePOST,
        path: "/api/workspaces/x/billing/reconcile",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "audit.view": [
    {
      route: "GET /api/workspaces/[wid]/audit",
      call: async () => ({
        method: "GET",
        handler: auditGET,
        path: "/api/workspaces/x/audit",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "workspace.settings": [
    {
      route: "PATCH /api/workspaces/[wid]",
      call: async () => ({
        method: "PATCH",
        handler: workspacePATCH,
        path: "/api/workspaces/x",
        params: { wid: A.ws.id },
        body: { name: unique("Renamed WS") },
      }),
    },
  ],
  "ai.manage": [
    {
      route: "POST /api/workspaces/[wid]/ai/connections",
      call: async () => ({
        method: "POST",
        handler: aiConnsPOST,
        path: "/api/workspaces/x/ai/connections",
        params: { wid: A.ws.id },
        body: { provider: "openai", label: unique("AI"), apiKey: fakeKey("matrix") },
      }),
    },
    {
      route: "PUT /api/workspaces/[wid]/ai/default-route",
      call: async () => ({
        method: "PUT",
        handler: aiDefaultPUT,
        path: "/api/workspaces/x/ai/default-route",
        params: { wid: A.ws.id },
        body: { route: null },
      }),
    },
    {
      route: "DELETE /api/workspaces/[wid]/ai/connections/[cid]",
      call: async () => {
        const { connection } = await connectAi(A.owner.user, A.ws.id, { model: null });
        return { method: "DELETE", handler: aiConnDELETE, path: "/api/workspaces/x/ai/connections/y", params: { wid: A.ws.id, cid: connection.id } };
      },
    },
  ],
  "ai.use": [
    {
      route: "GET /api/workspaces/[wid]/ai/models",
      call: async () => ({
        method: "GET",
        handler: aiModelsGET,
        path: "/api/workspaces/x/ai/models",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "oauthapp.manage": [
    {
      route: "GET /api/workspaces/[wid]/oauth-apps",
      call: async () => ({
        method: "GET",
        handler: oauthAppsGET,
        path: "/api/workspaces/x/oauth-apps",
        params: { wid: A.ws.id },
      }),
    },
  ],
  "sso.manage": [
    {
      route: "PUT /api/workspaces/[wid]/sso",
      call: async () => ({
        method: "PUT",
        handler: ssoPUT,
        path: "/api/workspaces/x/sso",
        params: { wid: A.ws.id },
        body: {
          issuer,
          clientId: "flowline-test",
          clientSecret: "sso-test-secret-not-logged",
          domains: ["flowline.test"],
          defaultRole: "viewer",
          enabled: false,
        },
      }),
    },
  ],
};

/* ───────────── results ───────────── */

interface Row {
  capability: Capability;
  route: string;
  results: Record<string, number>;
  ok: boolean;
}
const rows: Row[] = [];

beforeAll(async () => {
  fakeAi = await startFakeAi(0);
  fakeProviders = await startFakeProviders(0);
  issuer = `${fakeProviders.url}/oidc`;
  process.env.FLOWLINE_ENV = "test";
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${fakeAi.port},127.0.0.1:${fakeProviders.port},localhost:${fakeProviders.port}`;
  useAiDouble(fakeAi.url);
  A = await tenant("MxA");
  B = await tenant("MxB");
  nobody = await signIn("nobody", await makeUser("nobody"));
});

afterAll(async () => {
  Object.assign(process.env, prevEnv);
  console.log(
    `\ncapability × role matrix (${rows.length} routes):\n` +
      rows
        .map(
          (r) =>
            `${r.ok ? "ok " : "!! "}${r.capability.padEnd(19)} ${r.route.padEnd(62)} ${Object.entries(r.results)
              .map(([k, v]) => `${k}=${v}`)
              .join(" ")}`,
        )
        .join("\n"),
  );
  await fakeAi.close();
  await fakeProviders.close();
  await closeDb();
});

function expectedFor(cap: Capability, role: Role | "non-member") {
  if (role === "non-member") return "404";
  return can(role, cap) ? "allowed" : "403";
}

describe("capability × role matrix through the real route handlers", () => {
  it("every capability in CAPABILITIES has a probe row (or is explicitly reported as implicit/no-route)", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(TABLE, `missing table entry for ${cap}`).toHaveProperty(cap);
      if (TABLE[cap].length === 0) expect(NO_ROUTE_CAPS, `${cap} has no route probe and isn't listed as a no-route capability`).toContain(cap);
    }
    // Implicit caps are enforced by requireWorkspace's default "viewer" need, whose member set must equal the matrix.
    for (const cap of IMPLICIT_VIEWER_CAPS) expect([...CAPABILITIES[cap]].sort()).toEqual(["editor", "owner", "viewer"]);
  });

  for (const cap of ALL_CAPABILITIES) {
    for (const probe of TABLE[cap]) {
      it(`${cap}: ${probe.route}`, async () => {
        const actors: [string, Role | "non-member", Actor][] = [
          // Denied roles first: the allowed ones may mutate/destroy their own fresh target only.
          ["non-member", "non-member", B.owner],
          ["viewer", "viewer", A.viewer],
          ["editor", "editor", A.editor],
          ["owner", "owner", A.owner],
        ];
        const results: Record<string, number> = {};
        let ok = true;
        for (const [label, role, actor] of actors) {
          const r = await invoke(actor, await probe.call(actor));
          results[label] = r.status;
          const want = expectedFor(cap, role);
          const detail = `${cap} ${probe.route} as ${label}: got ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`;
          expect(r.status, `${detail} — never 5xx`).toBeLessThan(500);
          expect(r.status, `${detail} — never 401 for a signed-in user`).not.toBe(401);
          if (want === "404") {
            if (r.status !== 404) ok = false;
            expect(r.status, `${detail} — non-member must get 404`).toBe(404);
          } else if (want === "403") {
            if (r.status !== 403) ok = false;
            expect(r.status, `${detail} — member without capability must get 403`).toBe(403);
          } else {
            const accepted = r.status < 300 || (probe.okStatuses ?? []).includes(r.status);
            if (!accepted) ok = false;
            expect(accepted, `${detail} — allowed role must succeed (2xx${probe.okStatuses ? ` or ${probe.okStatuses.join("/")}` : ""})`).toBe(true);
          }
        }
        rows.push({ capability: cap, route: probe.route, results, ok });
      });
    }
  }

  it("a signed-out request gets 401, a signed-in member of nothing gets 404 (workspace-scoped) — never 5xx", async () => {
    const r = await invoke(null, {
      method: "GET",
      handler: workspaceGET,
      path: "/api/workspaces/x",
      params: { wid: A.ws.id },
    });
    expect(r.status).toBe(401);
    const f = await freshFlow(A);
    const scoped: Call[] = [
      {
        method: "GET",
        handler: workspaceGET,
        path: "/api/workspaces/x",
        params: { wid: A.ws.id },
      },
      {
        method: "GET",
        handler: flowGET,
        path: "/api/flows/x",
        params: { fid: f.id },
      },
      {
        method: "GET",
        handler: auditGET,
        path: "/api/workspaces/x/audit",
        params: { wid: A.ws.id },
      },
    ];
    for (const c of scoped) expect((await invoke(nobody, c)).status).toBe(404);
  });
});

describe("IDOR: workspace A's object ids used by workspace B's owner", () => {
  it("agents, agent runs, runs, connections, approvals → 404 (object-scoped routes)", async () => {
    const { agent, run: agentRun } = await freshAgentRun(A);
    const { run } = await freshRun(A);
    const conn = await freshConnection(A);
    const ap = await freshApproval(A);
    const calls: Call[] = [
      {
        method: "GET",
        handler: agentGET,
        path: "/api/agents/x",
        params: { aid: agent.id },
      },
      {
        method: "PUT",
        handler: agentPUT,
        path: "/api/agents/x",
        params: { aid: agent.id },
        body: { name: "pwn", instructions: "x", limits: limits() },
      },
      {
        method: "DELETE",
        handler: agentDELETE,
        path: "/api/agents/x",
        params: { aid: agent.id },
      },
      {
        method: "POST",
        handler: agentRunsPOST,
        path: "/api/agents/x/runs",
        params: { aid: agent.id },
        body: { message: "hi" },
      },
      {
        method: "GET",
        handler: agentRunGET,
        path: "/api/agent-runs/x",
        params: { rid: agentRun.id },
      },
      {
        method: "POST",
        handler: agentRunCancelPOST,
        path: "/api/agent-runs/x/cancel",
        params: { rid: agentRun.id },
      },
      {
        method: "GET",
        handler: runGET,
        path: "/api/runs/x",
        params: { rid: run.id },
      },
      {
        method: "POST",
        handler: runCancelPOST,
        path: "/api/runs/x/cancel",
        params: { rid: run.id },
      },
      {
        method: "GET",
        handler: connectionGET,
        path: "/api/connections/x",
        params: { cid: conn.id },
      },
      {
        method: "DELETE",
        handler: connectionDELETE,
        path: "/api/connections/x",
        params: { cid: conn.id },
      },
      {
        method: "POST",
        handler: approvalDecidePOST,
        path: "/api/approvals/x/decide",
        params: { aid: ap.id },
        body: { decision: "approve" },
      },
    ];
    for (const c of calls) {
      const r = await invoke(B.owner, c);
      expect(r.status, `${c.method} ${c.path} ${JSON.stringify(c.params)} → ${JSON.stringify(r.body).slice(0, 200)}`).toBe(404);
    }
    const [still] = await db.select().from(schema.approval).where(eq(schema.approval.id, ap.id));
    expect(still!.status).toBe("pending");
  });

  it("A's child ids under B's workspace/flow URL → 404: knowledge sources, api keys, invites, members, flow versions, proposals", async () => {
    const src = await freshSource(A);
    const key = await freshApiKey(A);
    const inv = await freshInvite(A);
    const fA = await freshFlow(A);
    const fB = await freshFlow(B);
    const { proposal } = await freshProposal(A);
    const calls: Call[] = [
      {
        method: "PATCH",
        handler: knowledgeSourcePATCH,
        path: "/api/workspaces/B/knowledge/x",
        params: { wid: B.ws.id, sid: src.id },
        body: { enabled: false },
      },
      {
        method: "DELETE",
        handler: knowledgeSourceDELETE,
        path: "/api/workspaces/B/knowledge/x",
        params: { wid: B.ws.id, sid: src.id },
      },
      {
        method: "DELETE",
        handler: apiKeyDELETE,
        path: "/api/workspaces/B/api-keys/x",
        params: { wid: B.ws.id, kid: key.id },
      },
      {
        method: "DELETE",
        handler: inviteDELETE,
        path: "/api/workspaces/B/invites/x",
        params: { wid: B.ws.id, iid: inv.id },
      },
      {
        method: "PATCH",
        handler: memberPATCH,
        path: "/api/workspaces/B/members/x",
        params: { wid: B.ws.id, uid: A.editor.user.id },
        body: { role: "owner" },
      },
      {
        method: "DELETE",
        handler: memberDELETE,
        path: "/api/workspaces/B/members/x",
        params: { wid: B.ws.id, uid: A.editor.user.id },
      },
      {
        method: "GET",
        handler: versionGET,
        path: "/api/flows/B/versions/x",
        params: { fid: fB.id, vid: fA.versionId },
      },
      {
        method: "POST",
        handler: restorePOST,
        path: "/api/flows/B/versions/x/restore",
        params: { fid: fB.id, vid: fA.versionId },
        body: { baseRevision: fB.revision, publish: false },
      },
      {
        method: "POST",
        handler: copilotDecidePOST,
        path: "/api/flows/B/copilot/x",
        params: { fid: fB.id, pid: proposal.id },
        body: { decision: "approve", confirmRemovals: true },
      },
      // A's own workspace id in the URL → still 404 for B (membership, not object, decides)
      {
        method: "GET",
        handler: versionGET,
        path: "/api/flows/A/versions/x",
        params: { fid: fA.id, vid: fA.versionId },
      },
    ];
    for (const c of calls) {
      const r = await invoke(B.owner, c);
      expect(r.status, `${c.method} ${c.path} ${JSON.stringify(c.params)} → ${JSON.stringify(r.body).slice(0, 200)}`).toBe(404);
    }
    // Nothing changed in A.
    const [k] = await db.select().from(schema.apiKey).where(eq(schema.apiKey.id, key.id));
    expect(k!.revokedAt).toBeNull();
    const [s] = await db.select().from(schema.knowledgeSource).where(eq(schema.knowledgeSource.id, src.id));
    expect(s!.enabled).toBe(true);
    expect(s!.deletedAt).toBeNull();
    const [i] = await db.select().from(schema.workspaceInvite).where(eq(schema.workspaceInvite.id, inv.id));
    expect(i!.revokedAt).toBeNull();
    const [m] = await db.select().from(schema.workspaceMember).where(eq(schema.workspaceMember.userId, A.editor.user.id));
    expect(m!.role).toBe("editor");
    const [p] = await db.select().from(schema.copilotProposal).where(eq(schema.copilotProposal.id, proposal.id));
    expect(p!.status).toBe("proposed");
  });

  it("malformed child ids are 404, not 500 on routes that guard uuid params", async () => {
    const malformed: Call[] = [
      {
        method: "PATCH",
        handler: knowledgeSourcePATCH,
        path: "/api/workspaces/A/knowledge/not-a-uuid",
        params: { wid: A.ws.id, sid: "not-a-uuid" },
        body: { enabled: false },
      },
      {
        method: "GET",
        handler: versionGET,
        path: "/api/flows/x/versions/not-a-uuid",
        params: { fid: (await freshFlow(A)).id, vid: "not-a-uuid" },
      },
      {
        method: "POST",
        handler: copilotDecidePOST,
        path: "/api/flows/x/copilot/not-a-uuid",
        params: { fid: (await freshFlow(A)).id, pid: "not-a-uuid" },
        body: { decision: "reject" },
      },
      {
        method: "PATCH",
        handler: memberPATCH,
        path: "/api/workspaces/A/members/nope",
        params: { wid: A.ws.id, uid: "nope" },
        body: { role: "viewer" },
      },
      {
        method: "GET",
        handler: agentGET,
        path: "/api/agents/not-a-uuid",
        params: { aid: "not-a-uuid" },
      },
      {
        method: "GET",
        handler: agentRunGET,
        path: "/api/agent-runs/not-a-uuid",
        params: { rid: "not-a-uuid" },
      },
    ];
    for (const c of malformed) {
      const r = await invoke(A.owner, c);
      expect(r.status, `${c.method} ${c.path} → ${JSON.stringify(r.body).slice(0, 200)}`).toBe(404);
    }
  });

  /**
   * SR-01: `DELETE /api/workspaces/[wid]/api-keys/[kid]` and `DELETE /api/workspaces/[wid]/invites/[iid]` pass the
   * raw path segment into a uuid-column WHERE clause (`revokeApiKey`, `revokeInvite`); Postgres rejects the cast
   * (22P02) and `route()` turns that into 500 INTERNAL. Owner-only, so not exploitable cross-tenant, but a 5xx is
   * never the right answer for bad input. Fix: `if (!isUuid(p.kid)) throw notFound(...)` in the route (or in the
   * service, as `requireSource` does for knowledge sources).
   */
  it("SR-01 regression: non-uuid api-key / invite ids return 404, not 500", async () => {
    const calls: Call[] = [
      {
        method: "DELETE",
        handler: apiKeyDELETE,
        path: "/api/workspaces/A/api-keys/not-a-uuid",
        params: { wid: A.ws.id, kid: "not-a-uuid" },
      },
      {
        method: "DELETE",
        handler: inviteDELETE,
        path: "/api/workspaces/A/invites/not-a-uuid",
        params: { wid: A.ws.id, iid: "not-a-uuid" },
      },
    ];
    const statuses: number[] = [];
    for (const c of calls) statuses.push((await invoke(A.owner, c)).status);
    expect(statuses, "both must be 404 (bad input), never 500").toEqual([404, 404]);
  });

  it("random (non-existent) uuids are 404 for everyone", async () => {
    const id = randomUUID();
    const missing: Call[] = [
      {
        method: "GET",
        handler: agentGET,
        path: "/api/agents/x",
        params: { aid: id },
      },
      {
        method: "GET",
        handler: runGET,
        path: "/api/runs/x",
        params: { rid: id },
      },
      {
        method: "GET",
        handler: workspaceGET,
        path: "/api/workspaces/x",
        params: { wid: id },
      },
      {
        method: "DELETE",
        handler: apiKeyDELETE,
        path: "/api/workspaces/A/api-keys/x",
        params: { wid: A.ws.id, kid: id },
      },
    ];
    for (const c of missing) expect((await invoke(A.owner, c)).status).toBe(404);
  });
});

describe("secrets never leave the server through projections", () => {
  it("connections, api keys, invites, sso config, agents and audit responses carry no ciphertext, hashes or tokens", async () => {
    const conn = await freshConnection(A);
    const { key } = await createApiKey(A.owner.user, A.ws.id, {
      name: unique("k"),
      mode: "test",
      scopes: ["runs:read"],
    });
    const { url } = await createInvite(A.owner.user, A.ws.id, {
      email: `${unique("s")}@flowline-test.local`,
      role: "viewer",
    });
    const inviteToken = url.split("/").pop()!;
    await invoke(A.owner, {
      method: "PUT",
      handler: ssoPUT,
      path: "/api/workspaces/x/sso",
      params: { wid: A.ws.id },
      body: {
        issuer,
        clientId: "flowline-test",
        clientSecret: "sso-test-secret-not-logged",
        domains: ["flowline.test"],
        defaultRole: "viewer",
        enabled: false,
      },
    });
    const reads: Call[] = [
      {
        method: "GET",
        handler: connectionGET,
        path: "/api/connections/x",
        params: { cid: conn.id },
      },
      {
        method: "GET",
        handler: wsConnectionsGET,
        path: "/api/workspaces/x/connections",
        params: { wid: A.ws.id },
      },
      {
        method: "GET",
        handler: apiKeysGET,
        path: "/api/workspaces/x/api-keys",
        params: { wid: A.ws.id },
      },
      {
        method: "GET",
        handler: invitesGET,
        path: "/api/workspaces/x/invites",
        params: { wid: A.ws.id },
      },
      {
        method: "GET",
        handler: ssoGET,
        path: "/api/workspaces/x/sso",
        params: { wid: A.ws.id },
      },
      {
        method: "GET",
        handler: auditGET,
        path: "/api/workspaces/x/audit",
        params: { wid: A.ws.id },
      },
      {
        method: "GET",
        handler: wsAgentsGET,
        path: "/api/workspaces/x/agents",
        params: { wid: A.ws.id },
      },
    ];
    const bodies: string[] = [];
    for (const c of reads) {
      const r = await invoke(A.owner, c);
      expect(r.status, c.path).toBe(200);
      bodies.push(JSON.stringify(r.body));
    }
    const text = bodies.join("\n");
    for (const needle of ["secretEnc", "not-a-real-secret-ciphertext", "keyHash", "tokenHash", "clientSecretEnc", "sso-test-secret-not-logged", inviteToken, key.split("_").pop()!]) {
      expect(text, `response contains ${needle}`).not.toContain(needle);
    }
  });
});
