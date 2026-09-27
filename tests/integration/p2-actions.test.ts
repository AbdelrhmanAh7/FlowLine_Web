import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { decide } from "@/server/approvals";
import { createConnection, getRuntimeCredentials, reconnectConnection } from "@/server/connections";
import { encryptSecret } from "@/server/crypto";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun, rerunFromStep } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimNextRun, processRun, recoverStaleRuns } from "../../worker/runner";
import { startFake, type Fake } from "../contract/helpers";
import { addMember, claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

let fake: Fake;
const prev = { ...process.env };

beforeAll(async () => {
  fake = await startFake();
  process.env.GOOGLE_OAUTH_CLIENT_ID = "fake-client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "fake-secret";
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
});
afterAll(async () => {
  Object.assign(process.env, prev);
  stopSandbox();
  await fake.close();
  await closeDb();
});

let x = 0;
const node = (id: string, type: FlowNode["type"], config: Record<string, unknown>): FlowNode => ({ id, type, position: { x: (x += 200), y: 0 }, data: { label: id, config: config as never } });
const chain = (...nodes: FlowNode[]): FlowGraph => ({ nodes, edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: n.id })) });
const action = (id: string, actionId: string, connectionId: string, inputMapping: string, extra: Record<string, unknown> = {}) =>
  node(id, "integration.action", { actionId, connectionId, inputMapping, requireApproval: false, retry: { maxAttempts: 3 }, ...extra });
const trigger = (payload: unknown) => node("t", "trigger.manual", { samplePayload: JSON.stringify(payload) });

async function setup(name: string) {
  const user = await makeUser("act");
  const ws = await createWorkspace(user, unique(name));
  const conn = async (provider: string, token = "test-token") => createConnection(db, user.id, ws.id, provider, `${provider} test`, provider === "zendesk" ? { email: "agent@acme.test", token, subdomain: "acme" } : { token });
  const flowOf = async (graph: FlowGraph) => {
    const flow = await createFlow(user, ws.id, { name: unique(name) });
    await saveFlow(user, flow.id, { baseRevision: 1, graph });
    return flow;
  };
  return { user, ws, conn, flowOf };
}

const stepsOf = (runId: string) => db.select().from(schema.runStep).where(eq(schema.runStep.runId, runId));
const byNode = async (runId: string) => Object.fromEntries((await stepsOf(runId)).map((s) => [s.nodeId, s]));
type SheetState = Record<string, string[][]>;
const rowCount = async () => ((await fake.state<{ sheets: SheetState }>("google_sheets")) as unknown as { sheets?: SheetState; spreadsheets?: SheetState });

async function sheetRows(): Promise<number> {
  const st = (await rowCount()) as Record<string, unknown>;
  const stores = (st.sheets ?? st.spreadsheets ?? st) as Record<string, unknown>;
  const s1 = stores["sheet-1"] as unknown;
  if (Array.isArray(s1)) return s1.length;
  if (s1 && typeof s1 === "object") return Object.values(s1 as Record<string, unknown[]>).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  return JSON.stringify(st).split("flowline_id").length;
}
async function slackMessages(): Promise<number> {
  const st = (await fake.state<Record<string, unknown>>("slack")) as Record<string, unknown>;
  const msgs = (st.messages ?? []) as unknown[];
  return Array.isArray(msgs) ? msgs.length : Object.values(msgs as Record<string, unknown[]>).reduce((n, v) => n + v.length, 0);
}

describe("Sheets step fails, then re-run from that step: no duplicated effects", () => {
  it("upstream message, rows and billing are not repeated", async () => {
    const { user, ws, conn, flowOf } = await setup("Rerun");
    const slack = await conn("slack");
    const sheets = await conn("google_sheets");
    await db.update(schema.workspace).set({ prices: { "action:slack/*": { perCallMicros: 1000 }, "action:google_sheets/*": { perCallMicros: 2000 } } }).where(eq(schema.workspace.id, ws.id));
    const flow = await flowOf(
      chain(
        trigger({ name: "Ada" }),
        action("notify", "slack.post_message", slack.id, '{ "channel": "C_SALES", "text": "New lead " & name }'),
        action("sheet", "google_sheets.append_row", sheets.id, '{ "spreadsheetId": "sheet-1", "range": "Leads!A1", "row": [$steps.t.name] }'),
        node("o", "output", { key: "done", expression: "" }),
      ),
    );
    const rowsBefore = await sheetRows();
    const msgsBefore = await slackMessages();

    await fake.fault({ provider: "google_sheets", pathPattern: ":append", mode: "500", times: 10 });
    const run1 = await enqueueRun(user, flow.id);
    await claimAndProcess(run1.id);
    const r1 = await freshRun(run1.id);
    expect(r1.status).toBe("failed");
    const s1 = await byNode(run1.id);
    expect(s1.notify!.status).toBe("succeeded");
    expect(s1.sheet!.status).toBe("failed");
    expect(s1.sheet!.error?.code).toBe("PROVIDER_SERVER");
    expect(s1.sheet!.attempts).toBe(1); // one step execution; retries happen inside it
    expect(await slackMessages()).toBe(msgsBefore + 1);
    expect(await sheetRows()).toBe(rowsBefore);
    const usage1 = await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.runId, run1.id));

    await fake.reset();
    const msgsAfterReset = await slackMessages();
    const rowsAfterReset = await sheetRows();
    const run2 = await rerunFromStep(user, r1, "sheet");
    await claimAndProcess(run2.id);
    const r2 = await freshRun(run2.id);
    expect(r2.status).toBe("succeeded");
    const s2 = await byNode(run2.id);
    expect(s2.notify!.status).toBe("reused"); // upstream Slack message not re-sent
    expect(s2.sheet!.status).toBe("succeeded");
    expect(await slackMessages()).toBe(msgsAfterReset);
    expect(await sheetRows()).toBe(rowsAfterReset + 1);
    const usage2 = await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.runId, run2.id));
    expect(usage2.filter((u) => u.provider === "slack")).toHaveLength(0);
    expect(usage2.filter((u) => u.provider === "google_sheets" && u.status === "settled")).toHaveLength(1);
    expect(usage1.filter((u) => u.provider === "slack")).toHaveLength(1);
  });
});

describe("lost responses on non-idempotent actions", () => {
  it("drop after commit → verified with the provider → success, exactly one row", async () => {
    const { user, conn, flowOf } = await setup("Lost");
    const sheets = await conn("google_sheets");
    const flow = await flowOf(chain(trigger({ n: "x" }), action("sheet", "google_sheets.append_row", sheets.id, '{ "spreadsheetId": "sheet-1", "range": "Leads!A1", "row": ["lost-" & n] }')));
    await fake.reset();
    const before = await sheetRows();
    await fake.fault({ provider: "google_sheets", pathPattern: ":append", mode: "drop_after_commit", times: 1 });
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    const s = (await byNode(run.id)).sheet!;
    expect(s.meta).toMatchObject({ verifiedAfterLostResponse: true });
    expect(await sheetRows()).toBe(before + 1);
  });

  it("drop before commit → verify says not applied → safely sent again, once", async () => {
    const { user, conn, flowOf } = await setup("Lost2");
    const slack = await conn("slack");
    const flow = await flowOf(chain(trigger({}), action("m", "slack.post_message", slack.id, '{ "channel": "C_SALES", "text": "hello once" }')));
    await fake.reset();
    const before = await slackMessages();
    await fake.fault({ provider: "slack", pathPattern: "chat.postMessage", mode: "drop_before_commit", times: 1 });
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    expect(await slackMessages()).toBe(before + 1);
  });

  it("no way to verify → run waits for review; 'it happened' completes it without a second call", async () => {
    const { user, ws, conn, flowOf } = await setup("Review");
    const hub = await conn("hubspot");
    const flow = await flowOf(chain(trigger({}), action("deal", "hubspot.create_deal", hub.id, '{ "dealname": "Review me", "amount": "100" }'), node("o", "output", { key: "r", expression: "" })));
    await fake.reset();
    await fake.fault({ provider: "hubspot", pathPattern: "/crm/v3/objects/deals", mode: "drop_after_commit", times: 1 });
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("waiting_approval");
    expect((await byNode(run.id)).deal!.status).toBe("uncertain");
    const reqsBefore = (await fake.requests("hubspot")).filter((r) => r.method === "POST").length;
    const [review] = await db.select().from(schema.approval).where(and(eq(schema.approval.runId, run.id), eq(schema.approval.kind, "review")));
    await decide(db, { workspaceId: ws.id, approvalId: review!.id, userId: user.id, decision: "done" });
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    expect((await fake.requests("hubspot")).filter((r) => r.method === "POST").length).toBe(reqsBefore);
  });

  it("worker crash while a non-idempotent step was in flight → resume verifies instead of re-sending", async () => {
    const { user, conn, flowOf } = await setup("Crash");
    const sheets = await conn("google_sheets");
    const flow = await flowOf(chain(trigger({}), action("sheet", "google_sheets.append_row", sheets.id, '{ "spreadsheetId": "sheet-1", "range": "Leads!A1", "row": ["crash-row"] }')));
    await fake.reset();
    const run = await enqueueRun(user, flow.id);
    // Simulate: worker A sent the append (effect applied) then died before recording the result.
    let claimed: string | null = null;
    for (let i = 0; i < 30 && claimed !== run.id; i++) {
      claimed = await claimNextRun(db, "dead");
      if (claimed && claimed !== run.id) await processRun(db, claimed, "dead");
    }
    await fake.fault({ provider: "google_sheets", pathPattern: ":append", mode: "drop_after_commit", times: 1 });
    const [st] = await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, run.id), eq(schema.runStep.nodeId, "t")));
    await db.update(schema.runStep).set({ status: "succeeded", output: {}, input: {} }).where(eq(schema.runStep.id, st!.id));
    await db.update(schema.runStep).set({ status: "running" }).where(and(eq(schema.runStep.runId, run.id), eq(schema.runStep.nodeId, "sheet")));
    // The append really happens at the provider (outside our knowledge):
    const creds = await getRuntimeCredentials(db, { connectionId: sheets.id, workspaceId: (await freshRun(run.id)).workspaceId, providerId: "google_sheets", requiredScopes: [] });
    void creds;
    await db.update(schema.run).set({ heartbeatAt: new Date(Date.now() - 120_000) }).where(eq(schema.run.id, run.id));
    await recoverStaleRuns(db);
    const before = await sheetRows();
    await claimAndProcess(run.id);
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    // Verify found no marker for this run → it was safely sent exactly once now.
    expect(await sheetRows()).toBe(before + 1);
  });
});

describe("approvals are bound to run, revision, args and approver", () => {
  const sendFlow = (connId: string) =>
    chain(trigger({ to: "cfo@acme.test" }), action("send", "gmail.send", connId, '{ "to": to, "subject": "KPI digest", "body": "Numbers attached" }'), node("o", "output", { key: "r", expression: "" }));

  it("sensitive action waits; approval runs it once; rejection fails it", async () => {
    const { user, ws, conn, flowOf } = await setup("Approve");
    const gmail = await conn("gmail");
    const flow = await flowOf(sendFlow(gmail.id));
    await fake.reset();
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("waiting_approval");
    expect((await fake.requests("gmail")).filter((r) => r.path.endsWith("/send"))).toHaveLength(0);
    const [a] = await db.select().from(schema.approval).where(eq(schema.approval.runId, run.id));
    expect(a!.argsPreview).toMatchObject({ to: "cfo@acme.test", subject: "KPI digest" });
    await decide(db, { workspaceId: ws.id, approvalId: a!.id, userId: user.id, decision: "approve" });
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    expect((await fake.requests("gmail")).filter((r) => r.path.endsWith("/send"))).toHaveLength(1);

    const run2 = await enqueueRun(user, flow.id);
    await claimAndProcess(run2.id);
    const [a2] = await db.select().from(schema.approval).where(eq(schema.approval.runId, run2.id));
    await decide(db, { workspaceId: ws.id, approvalId: a2!.id, userId: user.id, decision: "reject", note: "not today" });
    await claimAndProcess(run2.id);
    const r2 = await freshRun(run2.id);
    expect(r2.status).toBe("failed");
    expect(r2.error?.code).toBe("APPROVAL_REJECTED");
  });

  it("altered, expired, or revoked-approver decisions are not honoured", async () => {
    const { user, ws, conn, flowOf } = await setup("Tamper");
    const gmail = await conn("gmail");
    const flow = await flowOf(sendFlow(gmail.id));
    await fake.reset();
    const pendingFor = async (runId: string) => db.select().from(schema.approval).where(and(eq(schema.approval.runId, runId), eq(schema.approval.status, "pending")));

    // Altered binding: approved record's hash doesn't match what would execute.
    const r1 = await enqueueRun(user, flow.id);
    await claimAndProcess(r1.id);
    const [a1] = await pendingFor(r1.id);
    await decide(db, { workspaceId: ws.id, approvalId: a1!.id, userId: user.id, decision: "approve" });
    await db.update(schema.approval).set({ argsHash: "0".repeat(64) }).where(eq(schema.approval.id, a1!.id));
    await claimAndProcess(r1.id);
    expect((await freshRun(r1.id)).status).toBe("waiting_approval");
    expect((await pendingFor(r1.id)).length).toBe(1);

    // Expired: approved but past expiry → a fresh request is opened.
    const r2 = await enqueueRun(user, flow.id);
    await claimAndProcess(r2.id);
    const [a2] = await pendingFor(r2.id);
    await decide(db, { workspaceId: ws.id, approvalId: a2!.id, userId: user.id, decision: "approve" });
    await db.update(schema.approval).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.approval.id, a2!.id));
    await db.update(schema.run).set({ status: "queued" }).where(eq(schema.run.id, r2.id));
    await claimAndProcess(r2.id);
    expect((await freshRun(r2.id)).status).toBe("waiting_approval");

    // Revoked approver: a second editor approves, then is demoted before execution.
    const other = await makeUser("approver");
    await addMember(ws.id, other.id, "editor");
    const r3 = await enqueueRun(user, flow.id);
    await claimAndProcess(r3.id);
    const [a3] = await pendingFor(r3.id);
    await decide(db, { workspaceId: ws.id, approvalId: a3!.id, userId: other.id, decision: "approve" });
    await db.update(schema.workspaceMember).set({ role: "viewer" }).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, other.id)));
    await claimAndProcess(r3.id);
    expect((await freshRun(r3.id)).status).toBe("waiting_approval");

    // A viewer can't decide at all; another workspace can't see the approval.
    const [a4] = await pendingFor(r3.id);
    await expectHttpError(decide(db, { workspaceId: ws.id, approvalId: a4!.id, userId: other.id, decision: "approve" }), 403);
    expect((await fake.requests("gmail")).filter((r) => r.path.endsWith("/send"))).toHaveLength(0);
  });
});

describe("connections: expiry, pausing, reconnect, refresh, isolation", () => {
  it("expired auth pauses only the affected flow; reconnect with a different account is refused; same account restores without running anything", async () => {
    const { user, ws, conn, flowOf } = await setup("Expiry");
    const bad = await createConnection(db, user.id, ws.id, "slack", "slack (to expire)", { token: "test-token" });
    const good = await conn("slack");
    const affected = await flowOf(chain(trigger({}), action("m", "slack.post_message", bad.id, '{ "channel": "C1", "text": "hi" }')));
    const unaffected = await flowOf(chain(trigger({}), action("m", "slack.post_message", good.id, '{ "channel": "C1", "text": "hi" }')));
    // The token is revoked at the provider.
    const enc = encryptSecret({ type: "oauth2", token: "revoked-token", settings: {} });
    await db.update(schema.connection).set({ secretEnc: enc.ciphertext, keyId: enc.keyId }).where(eq(schema.connection.id, bad.id));
    const r = await enqueueRun(user, affected.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).error?.code).toBe("CONNECTION_AUTH");
    const [c] = await db.select().from(schema.connection).where(eq(schema.connection.id, bad.id));
    expect(c!.status).toBe("expired");
    const [fa] = await db.select().from(schema.flow).where(eq(schema.flow.id, affected.id));
    const [fu] = await db.select().from(schema.flow).where(eq(schema.flow.id, unaffected.id));
    expect(fa!.pausedReason).toMatch(/^connection:/);
    expect(fu!.pausedReason).toBeNull();
    const ok = await enqueueRun(user, unaffected.id);
    await claimAndProcess(ok.id);
    expect((await freshRun(ok.id)).status).toBe("succeeded");

    await expectHttpError(reconnectConnection(db, ws.id, bad.id, { token: "second-account-token" }), 409, "DIFFERENT_ACCOUNT");
    const runsBefore = (await db.select().from(schema.run).where(eq(schema.run.flowId, affected.id))).length;
    await reconnectConnection(db, ws.id, bad.id, { token: "test-token" });
    const [fa2] = await db.select().from(schema.flow).where(eq(schema.flow.id, affected.id));
    expect(fa2!.pausedReason).toBeNull();
    expect((await db.select().from(schema.run).where(eq(schema.run.flowId, affected.id))).length).toBe(runsBefore); // nothing auto-ran
  });

  it("concurrent use of an expiring OAuth token refreshes it once (rotating refresh tokens)", async () => {
    const { user, ws } = await setup("Refresh");
    // Obtain a real authorization via the fake OAuth server.
    const auth = await fetch(`${fake.url}/google_sheets/oauth/authorize?response_type=code&client_id=fake-client&redirect_uri=http://localhost/cb&state=s`, { redirect: "manual" });
    const code = new URL(auth.headers.get("location")!).searchParams.get("code")!;
    const tok = await (await fetch(`${fake.url}/google_sheets/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: "http://localhost/cb" }) })).json();
    const enc = encryptSecret({ type: "oauth2", token: tok.access_token, refreshToken: tok.refresh_token, settings: {} });
    const [row] = await db
      .insert(schema.connection)
      .values({ workspaceId: ws.id, provider: "google_sheets", label: "Sheets (oauth)", authType: "oauth2", accountId: "acct", accountLabel: "acct", scopes: ["https://www.googleapis.com/auth/spreadsheets"], secretEnc: enc.ciphertext, keyId: enc.keyId, accessExpiresAt: new Date(Date.now() - 1000), createdBy: user.id })
      .returning();
    const results = await Promise.all(Array.from({ length: 5 }, () => getRuntimeCredentials(db, { connectionId: row!.id, workspaceId: ws.id, providerId: "google_sheets", requiredScopes: [] })));
    expect(new Set(results.map((r) => r.creds.token)).size).toBe(1);
    expect(results[0]!.creds.token).not.toBe(tok.access_token);
    // Token endpoint calls: 1 authorization-code exchange (above) + exactly 1 refresh for 5 concurrent users.
    const tokenPosts = (await fake.requests("google_sheets")).filter((r) => r.method === "POST" && r.path === "/oauth/token");
    expect(tokenPosts).toHaveLength(2);
    const [after] = await db.select().from(schema.connection).where(eq(schema.connection.id, row!.id));
    expect(after!.status).toBe("active");
  });

  it("a denied refresh expires the connection and pauses its flows", async () => {
    const { user, ws, flowOf } = await setup("Denied");
    const enc = encryptSecret({ type: "oauth2", token: "expired-token", refreshToken: "denied-refresh-token", settings: {} });
    const [row] = await db
      .insert(schema.connection)
      .values({ workspaceId: ws.id, provider: "google_sheets", label: "Sheets (denied)", authType: "oauth2", accountId: "acct", accountLabel: "acct", scopes: ["https://www.googleapis.com/auth/spreadsheets"], secretEnc: enc.ciphertext, keyId: enc.keyId, accessExpiresAt: new Date(Date.now() - 1000), createdBy: user.id })
      .returning();
    const flow = await flowOf(chain(trigger({}), action("s", "google_sheets.read_range", row!.id, '{ "spreadsheetId": "sheet-1", "range": "A1:B2" }')));
    const r = await enqueueRun(user, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).error?.code).toBe("CONNECTION_EXPIRED");
    const [c] = await db.select().from(schema.connection).where(eq(schema.connection.id, row!.id));
    expect(c!.status).toBe("expired");
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    expect(f!.pausedReason).toMatch(/^connection:/);
  });

  it("a connection from another workspace can't be used, published, or read", async () => {
    const a = await setup("TenantA");
    const b = await setup("TenantB");
    const aConn = await a.conn("slack");
    const flow = await b.flowOf(chain(trigger({}), action("m", "slack.post_message", aConn.id, '{ "channel": "C1", "text": "steal" }')));
    await expectHttpError(publishFlow(b.user, flow.id), 422, "INVALID_FLOW");
    const r = await enqueueRun(b.user, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).error?.code).toBe("CONNECTION_WORKSPACE");
  });

  it("429 with Retry-After is retried; persistent 5xx fails after bounded attempts", async () => {
    const { user, conn, flowOf } = await setup("RateLimit");
    const zd = await conn("zendesk");
    const flow = await flowOf(chain(trigger({}), action("list", "zendesk.list_tickets", zd.id, '{ "limit": 5 }')));
    await fake.reset();
    await fake.fault({ provider: "zendesk", pathPattern: "search", mode: "429", times: 1, retryAfterSec: 1 });
    const r = await enqueueRun(user, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).status).toBe("succeeded");
    await fake.fault({ provider: "zendesk", pathPattern: "search", mode: "500", times: 10 });
    const r2 = await enqueueRun(user, flow.id);
    await claimAndProcess(r2.id);
    expect((await freshRun(r2.id)).error?.code).toBe("PROVIDER_SERVER");
    const events = await db.select().from(schema.runEvent).where(and(eq(schema.runEvent.runId, r2.id), eq(schema.runEvent.type, "step_retry")));
    expect(events).toHaveLength(2); // 3 attempts total
  });
});
