import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => sessionHolder.headers }));

import { GET as catalogGET } from "@/app/api/integrations/catalog/route";
import { GET as connectionsGET, POST as connectionsPOST } from "@/app/api/workspaces/[wid]/connections/route";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { requireConnection } from "@/server/access";
import { ConnectionError, getRuntimeCredentials, reconnectConnection } from "@/server/connections";
import { encryptSecretV2 } from "@/server/crypto";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun, getRunDetail } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { makeCtx, provider, runAction, startFake, type Fake } from "../contract/helpers";
import { addMember, claimAndProcess, closeDb, expectHttpError, freshRun, unique } from "./helpers";
import { jsonOf, makeVerifiedUser, ORIGIN, sessionFor, type TestSession } from "./platform-helpers";

let fake: Fake;
const envKeys = ["FLOWLINE_ENV", "FLOWLINE_PROVIDER_OVERRIDE", "FLOWLINE_EGRESS_ALLOWLIST"] as const;
const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
beforeAll(async () => { fake = await startFake(); });
afterAll(async () => {
  stopSandbox();
  await fake.close();
  await closeDb();
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

function request(session: TestSession, path: string, body?: unknown) {
  sessionHolder.headers = new Headers({ cookie: session.cookie });
  return new Request(`${ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: session.cookie, origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function setup() {
  const user = await makeVerifiedUser("hubspot");
  const ws = await createWorkspace(user, unique("HubSpot"));
  const session = await sessionFor(user);
  return { user, ws, session };
}

async function connect(owner: Awaited<ReturnType<typeof setup>>, token = "test-token", visibility = "workspace") {
  const res = await jsonOf(await connectionsPOST(request(owner.session, `/api/workspaces/${owner.ws.id}/connections`, {
    provider: "hubspot", label: "HubSpot test", fields: { token }, visibility,
  }), { params: Promise.resolve({ wid: owner.ws.id }) }));
  expect(res.status).toBe(201);
  expect(res.text).not.toContain(token);
  return res.body.connection as { id: string; provider: string; status: string };
}

function graph(connectionId: string, twoPages = false): FlowGraph {
  const nodes: FlowNode[] = [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: "{}" } } },
    { id: "first", type: "integration.action", position: { x: 300, y: 0 }, data: { label: "Contacts", config: { actionId: "hubspot.list_contacts", connectionId, inputMapping: '{ "limit": 1, "properties": ["email"] }', requireApproval: false, retry: { maxAttempts: 3 } } } },
  ];
  if (twoPages) nodes.push({ id: "second", type: "integration.action", position: { x: 600, y: 0 }, data: { label: "Next contacts", config: { actionId: "hubspot.list_contacts", connectionId, inputMapping: '{ "limit": 1, "after": $steps.first.nextAfter, "properties": ["email"] }', requireApproval: false, retry: { maxAttempts: 3 } } } });
  nodes.push({ id: "o", type: "output", position: { x: 900, y: 0 }, data: { label: "Result", config: { key: "contacts", expression: "" } } });
  return { nodes, edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: n.id })) };
}

async function flowOf(owner: Awaited<ReturnType<typeof setup>>, connectionId: string, twoPages = false) {
  const flow = await createFlow(owner.user, owner.ws.id, { name: unique("HubSpot contacts") });
  await saveFlow(owner.user, flow.id, { baseRevision: 1, graph: graph(connectionId, twoPages) });
  return flow;
}

describe("HubSpot through workspace connections and the worker", () => {
  it("exposes both schemas and keeps deferred/live-blocked status in the authenticated catalogue", async () => {
    const owner = await setup();
    const res = await jsonOf(await catalogGET(request(owner.session, `/api/integrations/catalog?workspaceId=${owner.ws.id}`), {}));
    expect(res.status).toBe(200);
    const hub = res.body.providers.find((p: { id: string }) => p.id === "hubspot");
    expect(hub.verification).toMatchObject({ adapter: true, betaScope: "deferred", live: "blocked" });
    const list = hub.actions.find((a: { id: string }) => a.id === "hubspot.list_contacts");
    expect(list.inputSchema.properties.limit).toMatchObject({ minimum: 1, maximum: 100 });
    expect(list.outputSchema.properties).toHaveProperty("nextAfter");
    const outsider = await setup();
    expect((await jsonOf(await catalogGET(request(outsider.session, `/api/integrations/catalog?workspaceId=${owner.ws.id}`), {}))).status).toBe(404);
  });

  it("encrypts API credentials, strips secrets from lists, and rejects viewer management or outsider access", async () => {
    const owner = await setup();
    const issued = await (await fetch(`${fake.url}/__fake/issue-token`, { method: "POST" })).json() as { token: string };
    const conn = await connect(owner, issued.token);
    const [stored] = await db.select().from(schema.connection).where(eq(schema.connection.id, conn.id));
    expect(stored!.workspaceId).toBe(owner.ws.id);
    expect(stored!.secretEnc).toMatch(/^v2\.a256gcm-kw\./);
    expect(stored!.secretEnc).not.toContain(issued.token);
    const runtime = await getRuntimeCredentials(db, { connectionId: conn.id, workspaceId: owner.ws.id, providerId: "hubspot", requiredScopes: ["crm.objects.contacts.read"], actingUserId: owner.user.id });
    expect(runtime.creds.token).toBe(issued.token);
    const listed = await jsonOf(await connectionsGET(request(owner.session, `/api/workspaces/${owner.ws.id}/connections`), { params: Promise.resolve({ wid: owner.ws.id }) }));
    expect(listed.status).toBe(200);
    expect(listed.text).not.toContain(issued.token);
    expect(listed.text).not.toContain("secretEnc");
    const outsider = await setup();
    await expectHttpError(requireConnection(outsider.user, conn.id), 404, "NOT_FOUND");
    await addMember(owner.ws.id, outsider.user.id, "viewer");
    const before = (await fake.requests("hubspot")).length;
    const denied = await jsonOf(await connectionsPOST(request(outsider.session, `/api/workspaces/${owner.ws.id}/connections`, { provider: "hubspot", fields: { token: issued.token } }), { params: Promise.resolve({ wid: owner.ws.id }) }));
    expect(denied.status).toBe(403);
    expect((await fake.requests("hubspot")).length).toBe(before);
  });

  it("does not save rejected credentials", async () => {
    const owner = await setup();
    const res = await jsonOf(await connectionsPOST(request(owner.session, `/api/workspaces/${owner.ws.id}/connections`, { provider: "hubspot", fields: { token: "invalid-hubspot-canary" } }), { params: Promise.resolve({ wid: owner.ws.id }) }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CONNECTION_REJECTED");
    expect(res.text).not.toContain("invalid-hubspot-canary");
    expect(await db.select().from(schema.connection).where(eq(schema.connection.workspaceId, owner.ws.id))).toHaveLength(0);
  });

  it("persists paginated action outputs, reuses encrypted credentials, and retries rate limits without writes", async () => {
    const owner = await setup();
    const conn = await connect(owner);
    await runAction("hubspot.upsert_contact", makeCtx(provider("hubspot"), { type: "api_key", token: "test-token" }), { email: `${unique("page")}@example.com` });
    const flow = await flowOf(owner, conn.id, true);
    const state = await fake.state("hubspot");
    const before = (await fake.requests("hubspot")).length;
    await fake.fault({ provider: "hubspot", pathPattern: "^/crm/v3/objects/contacts$", mode: "429", times: 1, retryAfterSec: 0 });
    const run = await enqueueRun(owner.user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    const steps = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, run.id));
    const first = steps.find((s) => s.nodeId === "first")!;
    const second = steps.find((s) => s.nodeId === "second")!;
    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("succeeded");
    expect(first.output).toMatchObject({ contacts: [{ id: "501", properties: { email: "alice@example.com" } }], nextAfter: "601" });
    expect(second.output).toMatchObject({ contacts: [{ id: "601" }] });
    const requests = (await fake.requests("hubspot")).slice(before);
    expect(requests).toHaveLength(3);
    expect(requests.every((r) => r.method === "GET")).toBe(true);
    expect(await fake.state("hubspot")).toEqual(state);
    expect(JSON.stringify(await getRunDetail(run.id))).not.toContain("test-token");
  });

  it("blocks a foreign workspace connection before any provider call and rejects publication", async () => {
    const owner = await setup();
    const outsider = await setup();
    const conn = await connect(owner);
    const flow = await flowOf(outsider, conn.id);
    await expectHttpError(publishFlow(outsider.user, flow.id), 422, "INVALID_FLOW");
    const before = (await fake.requests("hubspot")).length;
    const run = await enqueueRun(outsider.user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).error?.code).toBe("CONNECTION_WORKSPACE");
    expect((await fake.requests("hubspot")).length).toBe(before);
  });

  it("does not share a private connection with another member", async () => {
    const owner = await setup();
    const member = await makeVerifiedUser("hubspot-member");
    await addMember(owner.ws.id, member.id, "editor");
    const conn = await connect(owner, "test-token", "private");
    const before = (await fake.requests("hubspot")).length;
    await expect(getRuntimeCredentials(db, { connectionId: conn.id, workspaceId: owner.ws.id, providerId: "hubspot", requiredScopes: [], actingUserId: member.id })).rejects.toMatchObject({ code: "CONNECTION_PRIVATE" });
    expect((await fake.requests("hubspot")).length).toBe(before);
  });

  it("pauses only affected flows on revocation; reconnect rejects another portal and never auto-runs", async () => {
    const owner = await setup();
    const bad = await connect(owner);
    const good = await connect(owner);
    const affected = await flowOf(owner, bad.id);
    const unaffected = await flowOf(owner, good.id);
    const enc = encryptSecretV2({ type: "api_key", token: "revoked-token", settings: {} }, { table: "connection", rowId: bad.id, workspaceId: owner.ws.id, provider: "hubspot", purpose: "credentials" });
    await db.update(schema.connection).set({ secretEnc: enc.ciphertext, keyId: enc.keyId }).where(eq(schema.connection.id, bad.id));
    const run = await enqueueRun(owner.user, affected.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).error?.code).toBe("CONNECTION_AUTH");
    const [paused] = await db.select().from(schema.flow).where(eq(schema.flow.id, affected.id));
    const [untouched] = await db.select().from(schema.flow).where(eq(schema.flow.id, unaffected.id));
    expect(paused!.pausedReason).toMatch(/^connection:/);
    expect(untouched!.pausedReason).toBeNull();
    await expectHttpError(reconnectConnection(db, owner.ws.id, bad.id, { token: "second-account-token" }), 409, "DIFFERENT_ACCOUNT");
    await expect(getRuntimeCredentials(db, { connectionId: bad.id, workspaceId: owner.ws.id, providerId: "hubspot", requiredScopes: [] })).rejects.toBeInstanceOf(ConnectionError);
    await reconnectConnection(db, owner.ws.id, bad.id, { token: "test-token" });
    const [resumed] = await db.select().from(schema.flow).where(eq(schema.flow.id, affected.id));
    expect(resumed!.pausedReason).toBeNull();
    expect(await db.select().from(schema.run).where(and(eq(schema.run.flowId, affected.id), eq(schema.run.workspaceId, owner.ws.id)))).toHaveLength(1);
    const rerun = await enqueueRun(owner.user, affected.id);
    await claimAndProcess(rerun.id);
    expect((await freshRun(rerun.id)).status).toBe("succeeded");
  });
});
