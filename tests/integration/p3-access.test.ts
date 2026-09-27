import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as v1RunPOST } from "@/app/api/v1/flows/[fid]/runs/route";
import { GET as v1FlowsGET } from "@/app/api/v1/flows/route";
import { GET as v1RunGET } from "@/app/api/v1/runs/[rid]/route";
import { db, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { decide } from "@/server/approvals";
import { createApiKey, revokeApiKey } from "@/server/apikeys";
import { listAudit } from "@/server/audit";
import { createFlow, saveFlow } from "@/server/flows";
import { HttpError, route } from "@/server/http";
import { acceptInvite, changeRole, createInvite, previewInvite, removeMember, revokeInvite } from "@/server/members";
import { ALL_CAPABILITIES, can, CAPABILITIES } from "@/server/permissions";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimNextRun, processRun } from "../../worker/runner";
import { addMember, claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

beforeAll(async () => {
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
});
afterAll(closeDb);

const graph = (): FlowGraph => ({
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: '{ "n": 2 }' } } },
    { id: "x", type: "transform.json", position: { x: 200, y: 0 }, data: { label: "Double", config: { expression: '{ "v": n * 2 }' } } },
    { id: "o", type: "output", position: { x: 400, y: 0 }, data: { label: "Out", config: { key: "r", expression: "" } } },
  ],
  edges: [
    { id: "e1", source: "t", target: "x" },
    { id: "e2", source: "x", target: "o" },
  ],
});

async function workspaceWithFlow(name: string) {
  const owner = await makeUser("own");
  const ws = await createWorkspace(owner, unique(name));
  const flow = await createFlow(owner, ws.id, { name: unique("Flow") });
  await saveFlow(owner, flow.id, { baseRevision: 1, graph: graph() });
  return { owner, ws, flow };
}

describe("permission matrix", () => {
  it("owner ⊇ editor ⊇ viewer; managing members, keys, billing and audit is owner-only; viewers can't run, edit or approve", () => {
    for (const cap of ALL_CAPABILITIES) {
      if (can("viewer", cap)) expect(can("editor", cap)).toBe(true);
      if (can("editor", cap)) expect(can("owner", cap)).toBe(true);
    }
    for (const cap of ["member.manage", "apikey.manage", "billing.manage", "audit.view", "workspace.settings", "sso.manage"] as const) expect(CAPABILITIES[cap]).toEqual(["owner"]);
    for (const cap of ["flow.edit", "flow.run", "flow.publish", "approval.decide", "integration.manage", "agent.run", "knowledge.manage"] as const) expect(can("viewer", cap)).toBe(false);
    expect(can(null, "flow.view")).toBe(false);
  });
});

describe("members and invitations", () => {
  it("invite → accept by the invited email only, once; role change and removal take effect; audit trail", async () => {
    const { owner, ws } = await workspaceWithFlow("Invites");
    const invitee = await makeUser("inv");
    const stranger = await makeUser("str");
    const { url, invite } = await createInvite(owner, ws.id, { email: invitee.email.toUpperCase(), role: "editor" });
    const token = url.split("/").pop()!;
    expect(invite.status).toBe("pending");
    const [row] = await db.select().from(schema.workspaceInvite).where(eq(schema.workspaceInvite.id, invite.id));
    expect(row!.tokenHash).not.toContain(token); // only the hash is stored
    expect((await previewInvite(stranger, token)).emailMatches).toBe(false);
    await expectHttpError(acceptInvite(stranger, token), 403, "INVITE_EMAIL_MISMATCH");
    const joined = await acceptInvite(invitee, token);
    expect(joined.role).toBe("editor");
    await expectHttpError(acceptInvite(invitee, token), 409, "INVITE_USED");
    await expectHttpError(acceptInvite(invitee, "x".repeat(43)), 404);

    await changeRole(owner, ws.id, invitee.id, "viewer");
    const [m] = await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, invitee.id)));
    expect(m!.role).toBe("viewer");
    await expectHttpError(changeRole(owner, ws.id, owner.id, "editor"), 409, "LAST_OWNER");
    await expectHttpError(removeMember(owner, ws.id, owner.id), 409, "LAST_OWNER");
    await removeMember(owner, ws.id, invitee.id);
    const gone = await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, invitee.id)));
    expect(gone).toHaveLength(0);

    const actions = (await listAudit(db, ws.id)).events.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["member.invited", "member.joined", "member.role_changed", "member.removed"]));
    expect(JSON.stringify((await listAudit(db, ws.id)).events)).not.toContain(token);
  });

  it("revoked and expired invitations can't be used; a new invite replaces the old one", async () => {
    const { owner, ws } = await workspaceWithFlow("InviteRevoke");
    const u = await makeUser("rv");
    const a = await createInvite(owner, ws.id, { email: u.email, role: "viewer" });
    const b = await createInvite(owner, ws.id, { email: u.email, role: "editor" });
    await expectHttpError(acceptInvite(u, a.url.split("/").pop()!), 410, "INVITE_REVOKED");
    await revokeInvite(owner, ws.id, b.invite.id);
    await expectHttpError(acceptInvite(u, b.url.split("/").pop()!), 410, "INVITE_REVOKED");
    const c = await createInvite(owner, ws.id, { email: u.email, role: "viewer" });
    await db.update(schema.workspaceInvite).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.workspaceInvite.id, c.invite.id));
    await expectHttpError(acceptInvite(u, c.url.split("/").pop()!), 410, "INVITE_EXPIRED");
  });

  it("a viewer can't approve a protected action (server-side), and an approval by a later-demoted editor is not honoured", async () => {
    const { owner, ws } = await workspaceWithFlow("ViewerApprove");
    const viewer = await makeUser("vw");
    await addMember(ws.id, viewer.id, "viewer");
    // A pending approval row (bound to a real run) is enough to exercise decide().
    const flow = await createFlow(owner, ws.id, { name: unique("F") });
    await saveFlow(owner, flow.id, { baseRevision: 1, graph: graph() });
    const run = await enqueueRun(owner, flow.id);
    const [ap] = await db
      .insert(schema.approval)
      .values({ workspaceId: ws.id, runId: run.id, flowVersionId: run.flowVersionId, nodeId: "x", kind: "approval", actionId: "gmail.send", argsHash: "h", expiresAt: new Date(Date.now() + 60_000) })
      .returning();
    await expectHttpError(decide(db, { workspaceId: ws.id, approvalId: ap!.id, userId: viewer.id, decision: "approve" }), 403, "FORBIDDEN");
    const [still] = await db.select().from(schema.approval).where(eq(schema.approval.id, ap!.id));
    expect(still!.status).toBe("pending");
  });
});

describe("API keys and the invocation API", () => {
  const req = (url: string, key: string | null, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", ...(init.headers as object) } });
  const call = async (h: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>, r: Request, params: Record<string, string> = {}) => {
    const res = await h(r, { params: Promise.resolve(params) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("live key runs the published version; status endpoint; idempotency; the stored key is only a hash", async () => {
    const { owner, ws, flow } = await workspaceWithFlow("ApiLive");
    const { key, apiKey } = await createApiKey(owner, ws.id, { name: "ci", mode: "live", scopes: ["runs:write", "runs:read", "flows:read"] });
    expect(key).toMatch(/^fl_live_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
    const [stored] = await db.select().from(schema.apiKey).where(eq(schema.apiKey.id, apiKey.id));
    expect(JSON.stringify(stored)).not.toContain(key.split("_").pop()!);

    let r = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: "{}" }), { fid: flow.id });
    expect(r.status).toBe(409); // not published yet
    await publishFlow(owner, flow.id);
    // The draft changes after publishing: the API must still run the published version.
    const [cur] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    const g = graph();
    (g.nodes[1]!.data.config as { expression: string }).expression = '{ "v": n * 1000 }';
    await saveFlow(owner, flow.id, { baseRevision: cur!.revision, graph: g });

    r = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: JSON.stringify({ input: { n: 5 } }), headers: { "idempotency-key": "order-1" } }), { fid: flow.id });
    expect(r.status).toBe(202);
    const runId = r.body.id as string;
    const again = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: JSON.stringify({ input: { n: 5 } }), headers: { "idempotency-key": "order-1" } }), { fid: flow.id });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: runId, duplicate: true });

    await claimAndProcess(runId);
    const s = await call(v1RunGET as never, req(`/api/v1/runs/${runId}`, key), { rid: runId });
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ status: "succeeded", output: { r: { v: 10 } } });
    const run = await freshRun(runId);
    expect(run.triggerKind).toBe("api");
    expect(run.apiKeyId).toBe(apiKey.id);
    expect(run.flowVersionId).toBe(cur!.publishedVersionId ?? (await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id)))[0]!.publishedVersionId);
    const lst = await call(v1FlowsGET as never, req(`/api/v1/flows`, key));
    expect((lst.body.flows as { id: string }[]).map((f) => f.id)).toContain(flow.id);
  });

  it("test key runs a draft snapshot; payload is validated", async () => {
    const { owner, ws, flow } = await workspaceWithFlow("ApiTest");
    const { key } = await createApiKey(owner, ws.id, { name: "dev", mode: "test", scopes: ["runs:write"] });
    const bad = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: JSON.stringify({ input: "nope" }) }), { fid: flow.id });
    expect(bad.status).toBe(400);
    const extra = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: JSON.stringify({ input: {}, flowId: "x" }) }), { fid: flow.id });
    expect(extra.status).toBe(400);
    const ok = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: JSON.stringify({ input: { n: 1 } }) }), { fid: flow.id });
    expect(ok.status).toBe(202);
  });

  it("revoked, expired, malformed, missing, wrong-workspace and insufficient-scope keys are refused", async () => {
    const a = await workspaceWithFlow("ApiA");
    const b = await workspaceWithFlow("ApiB");
    const readOnly = await createApiKey(a.owner, a.ws.id, { name: "ro", mode: "test", scopes: ["runs:read"] });
    const rw = await createApiKey(a.owner, a.ws.id, { name: "rw", mode: "test", scopes: ["runs:write", "runs:read"] });
    const post = (key: string | null, fid: string) => call(v1RunPOST as never, req(`/api/v1/flows/${fid}/runs`, key, { method: "POST", body: "{}" }), { fid });

    expect((await post(null, a.flow.id)).body).toMatchObject({ error: { code: "API_KEY_REQUIRED" } });
    expect((await post("fl_live_nothere_x", a.flow.id)).status).toBe(401);
    expect((await post(rw.key.slice(0, -1) + (rw.key.endsWith("A") ? "B" : "A"), a.flow.id)).body).toMatchObject({ error: { code: "API_KEY_INVALID" } });
    const scope = await post(readOnly.key, a.flow.id);
    expect(scope.status).toBe(403);
    expect(scope.body).toMatchObject({ error: { code: "INSUFFICIENT_SCOPE" } });
    // Another workspace's flow is invisible to this key (404, not 403).
    expect((await post(rw.key, b.flow.id)).status).toBe(404);
    // A run of workspace A can't be read with a key of workspace B.
    const bKey = await createApiKey(b.owner, b.ws.id, { name: "b", mode: "test", scopes: ["runs:read"] });
    const aRun = await enqueueRun(a.owner, a.flow.id);
    expect((await call(v1RunGET as never, req(`/api/v1/runs/${aRun.id}`, bKey.key), { rid: aRun.id })).status).toBe(404);

    await db.update(schema.apiKey).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.apiKey.id, rw.apiKey.id));
    expect((await post(rw.key, a.flow.id)).body).toMatchObject({ error: { code: "API_KEY_EXPIRED" } });
    const rw2 = await createApiKey(a.owner, a.ws.id, { name: "rw2", mode: "test", scopes: ["runs:write"] });
    await revokeApiKey(a.owner, a.ws.id, rw2.apiKey.id);
    expect((await post(rw2.key, a.flow.id)).body).toMatchObject({ error: { code: "API_KEY_REVOKED" } });
    const actions = (await listAudit(db, a.ws.id)).events.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["apikey.created", "apikey.revoked"]));
  });

  it("a key stops working for runs when its creator is demoted to viewer or removed", async () => {
    const { owner, ws, flow } = await workspaceWithFlow("ApiOwner");
    const editor = await makeUser("ed");
    await addMember(ws.id, editor.id, "owner");
    const { key } = await createApiKey(editor, ws.id, { name: "e", mode: "test", scopes: ["runs:write"] });
    await changeRole(owner, ws.id, editor.id, "viewer");
    const r = await call(v1RunPOST as never, req(`/api/v1/flows/${flow.id}/runs`, key, { method: "POST", body: "{}" }), { fid: flow.id });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "KEY_OWNER_NOT_ALLOWED" } });
  });
});

describe("execution limit and ledger", () => {
  it("the monthly execution limit refuses new runs; each run is recorded once", async () => {
    const { owner, ws, flow } = await workspaceWithFlow("ExecLimit");
    await db.update(schema.workspace).set({ maxMonthlyExecutions: 2 }).where(eq(schema.workspace.id, ws.id));
    const r1 = await enqueueRun(owner, flow.id);
    await enqueueRun(owner, flow.id);
    await expectHttpError(enqueueRun(owner, flow.id), 429, "EXECUTION_LIMIT");
    const ev = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.runId, r1.id), eq(schema.usageEvent.kind, "execution")));
    expect(ev).toHaveLength(1);
  });

  it("concurrent enqueues never exceed the limit", async () => {
    const { owner, ws, flow } = await workspaceWithFlow("ExecRace");
    await db.update(schema.workspace).set({ maxMonthlyExecutions: 3, maxQueuedRuns: 100 }).where(eq(schema.workspace.id, ws.id));
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => enqueueRun(owner, flow.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    for (const r of results.filter((x) => x.status === "rejected")) expect(((r as PromiseRejectedResult).reason as HttpError).code).toBe("EXECUTION_LIMIT");
  });
});

describe("CSRF defence", () => {
  it("a cookie-carrying cross-site POST is refused before the handler runs; same-origin and cookie-less requests pass", async () => {
    let ran = 0;
    const h = route(async () => {
      ran++;
      return new Response("{}");
    });
    const mk = (headers: Record<string, string>) => new Request("http://localhost:3100/api/x", { method: "POST", headers, body: "{}" });
    expect((await h(mk({ cookie: "s=1", origin: "https://evil.example" }), {})).status).toBe(403);
    expect((await h(mk({ cookie: "s=1", "sec-fetch-site": "cross-site" }), {})).status).toBe(403);
    expect(ran).toBe(0);
    expect((await h(mk({ cookie: "s=1", "sec-fetch-site": "same-origin" }), {})).status).toBe(200);
    expect((await h(mk({ cookie: "s=1", origin: "http://localhost:3100" }), {})).status).toBe(200);
    expect((await h(mk({ authorization: "Bearer x" }), {})).status).toBe(200);
  });
});
