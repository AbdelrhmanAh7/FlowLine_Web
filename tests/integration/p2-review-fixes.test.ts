import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as webhookPOST } from "@/app/api/hooks/[token]/route";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { getProvider } from "@/integrations/registry";
import { decide } from "@/server/approvals";
import { createConnection, startOAuth } from "@/server/connections";
import { safeFetch } from "@/server/egress";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow, signWebhook } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimNextRun, processRun, recoverStaleRuns } from "../../worker/runner";
import { startFake, type Fake } from "../contract/helpers";
import { claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";
import { seedPlatformCredential } from "../fixtures/platform-seed";

/** Regression tests for the Phase 2 security review (Fable 5.1): H1/H2 live in p2-postgres.test.ts. */
let fake: Fake;
const prev = { ...process.env };

beforeAll(async () => {
  fake = await startFake();
  // Platform OAuth apps live in the admin panel's records now (never env at runtime): seed the same fake app.
  await seedPlatformCredential("integration.slack", { publicId: "fake-slack-client", secret: "fake-slack-secret" });
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
const trigger = (payload: unknown) => node("t", "trigger.manual", { samplePayload: JSON.stringify(payload) });
const out = () => node("o", "output", { key: "r", expression: "" });
const slackPost = (id: string, connId: string, mapping: string, extra: Record<string, unknown> = {}) =>
  node(id, "integration.action", { actionId: "slack.post_message", connectionId: connId, inputMapping: mapping, requireApproval: false, retry: { maxAttempts: 1 }, ...extra });
const httpPost = (id: string, channel: string) =>
  node(id, "http.request", {
    method: "POST",
    url: `"${fake.url}/slack/chat.postMessage"`,
    headers: '{ "authorization": "Bearer test-token" }',
    body: `{ "channel": "${channel}", "text": "via http" }`,
    sideEffect: "non_idempotent",
    timeoutMs: 5000,
    retry: { maxAttempts: 3 },
  });

async function setup(name: string) {
  const user = await makeUser("rev");
  const ws = await createWorkspace(user, unique(name));
  const slack = await createConnection(db, user.id, ws.id, "slack", "slack test", { token: "test-token" });
  const flowOf = async (graph: FlowGraph, flowName = unique(name)) => {
    const flow = await createFlow(user, ws.id, { name: flowName });
    await saveFlow(user, flow.id, { baseRevision: 1, graph });
    return flow;
  };
  return { user, ws, slack, flowOf };
}
const posts = async (channel: string) => {
  const st = await fake.state<{ messages: { channel: string; text: string }[] }>("slack");
  return st.messages.filter((m) => m.channel === channel);
};
const stepOf = async (runId: string, nodeId: string) => (await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId))))[0]!;
const reviewsOf = (runId: string) => db.select().from(schema.approval).where(and(eq(schema.approval.runId, runId), eq(schema.approval.kind, "review")));

/** A worker claimed the run, finished `done` steps, and died while `running` was in flight. */
async function crashDuring(runId: string, done: Record<string, unknown>, running: string) {
  let claimed: string | null = null;
  for (let i = 0; i < 50 && claimed !== runId; i++) {
    claimed = await claimNextRun(db, "doomed");
    if (claimed && claimed !== runId) await processRun(db, claimed, "doomed");
  }
  expect(claimed).toBe(runId);
  for (const [nodeId, output] of Object.entries(done)) {
    await db.update(schema.runStep).set({ status: "succeeded", input: {}, output: output as object }).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId)));
  }
  await db.update(schema.runStep).set({ status: "running" }).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, running)));
  await db.update(schema.run).set({ heartbeatAt: new Date(Date.now() - 120_000) }).where(eq(schema.run.id, runId));
  await recoverStaleRuns(db);
}

describe("M1 — non-idempotent HTTP requests are never blindly re-sent", () => {
  it("a worker that died mid-request leads to a review, not a second POST", async () => {
    const channel = unique("C_HTTP");
    const { user, ws, flowOf } = await setup("HttpCrash");
    const flow = await flowOf(chain(trigger({}), httpPost("h", channel), out()));
    const run = await enqueueRun(user, flow.id);
    await crashDuring(run.id, { t: {} }, "h");
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("waiting_approval");
    expect((await stepOf(run.id, "h")).status).toBe("uncertain");
    expect(await posts(channel)).toHaveLength(0);
    const [review] = await reviewsOf(run.id);
    await decide(db, { workspaceId: ws.id, approvalId: review!.id, userId: user.id, decision: "done" });
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    expect(await posts(channel)).toHaveLength(0); // "it happened" → no re-send
  });

  it("a reviewer's retry allows exactly one more attempt; a second lost response asks again", async () => {
    const channel = unique("C_RETRY");
    const { user, ws, flowOf } = await setup("HttpRetry");
    const flow = await flowOf(chain(trigger({}), httpPost("h", channel), out()));
    await fake.fault({ provider: "slack", pathPattern: "chat.postMessage", mode: "drop_after_commit", times: 2 });
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await stepOf(run.id, "h")).status).toBe("uncertain");
    expect(await posts(channel)).toHaveLength(1); // applied, response lost

    const [first] = await reviewsOf(run.id);
    await decide(db, { workspaceId: ws.id, approvalId: first!.id, userId: user.id, decision: "retry" });
    await claimAndProcess(run.id);
    expect(await posts(channel)).toHaveLength(2); // the one reviewed retry
    expect((await freshRun(run.id)).status).toBe("waiting_approval"); // lost again → a NEW review, no third send
    const reviews = await reviewsOf(run.id);
    expect(reviews.map((r) => r.status).sort()).toEqual(["pending", "superseded"]);

    await claimAndProcess(run.id).catch(() => {}); // nothing to do while pending
    expect(await posts(channel)).toHaveLength(2);
  });
});

describe("M2 — an interrupted loop over a subflow with side effects asks for review", () => {
  it("does not replay the child Slack posts", async () => {
    const channel = unique("C_LOOP");
    const { user, ws, slack, flowOf } = await setup("LoopCrash");
    const child = await flowOf(chain(trigger({ n: 1 }), slackPost("post", slack.id, `{ "channel": "${channel}", "text": "item " & $string(n) }`), out()), unique("Child"));
    await publishFlow(user, child.id);
    const [ver] = await db.select({ version: schema.flowVersion.version }).from(schema.flowVersion).where(and(eq(schema.flowVersion.flowId, child.id), eq(schema.flowVersion.reason, "publish")));
    const parent = await flowOf(chain(trigger({ items: [{ n: 1 }, { n: 2 }] }), node("loop", "logic.loop", { items: "items", flowId: child.id, version: ver!.version, maxItems: 10 }), out()));
    const run = await enqueueRun(user, parent.id);
    await crashDuring(run.id, { t: { items: [{ n: 1 }, { n: 2 }] } }, "loop");
    const before = (await posts(channel)).length;
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("waiting_approval");
    expect((await stepOf(run.id, "loop")).status).toBe("uncertain");
    expect(await posts(channel)).toHaveLength(before);
    const [review] = await reviewsOf(run.id);
    await decide(db, { workspaceId: ws.id, approvalId: review!.id, userId: user.id, decision: "retry" });
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    expect(await posts(channel)).toHaveLength(before + 2); // one deliberate, reviewed re-run
  });
});

describe("M3 — webhook signatures can't be replayed under a new event id", () => {
  async function hookFlow(scheme: "flowline" | "github") {
    const { user, flowOf } = await setup("Replay");
    const flow = await flowOf(chain(node("t", "trigger.webhook", { samplePayload: "{}", signatureScheme: scheme }), out()));
    const pub = await publishFlow(user, flow.id);
    return { token: pub.webhook!.url.split("/").pop()!, secret: pub.webhook!.secret! };
  }
  const post = (token: string, headers: Record<string, string>, body: string) =>
    webhookPOST(new Request(`http://localhost/api/hooks/${token}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body }), { params: Promise.resolve({ token }) });

  it("flowline scheme: the event id is signed", async () => {
    const { token, secret } = await hookFlow("flowline");
    const body = JSON.stringify({ a: 1 });
    const sig = signWebhook(secret, body, "evt-1");
    expect((await post(token, { "x-flowline-signature": sig, "x-flowline-event-id": "evt-1" }, body)).status).toBe(202);
    const replay = await post(token, { "x-flowline-signature": sig, "x-flowline-event-id": "evt-2" }, body);
    expect(replay.status).toBe(401);
  });

  it("github scheme: an already-accepted signature is refused under a new delivery id", async () => {
    const { token, secret } = await hookFlow("github");
    const body = JSON.stringify({ action: "opened", number: 1 });
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect((await post(token, { "x-hub-signature-256": sig, "x-github-delivery": "d-1" }, body)).status).toBe(202);
    expect((await post(token, { "x-hub-signature-256": sig, "x-github-delivery": "d-1" }, body)).status).toBe(200); // same delivery → dedupe
    const replay = await post(token, { "x-hub-signature-256": sig, "x-github-delivery": "d-2" }, body);
    expect(replay.status).toBe(409);
  });
});

describe("M4 — resume uses real upstream values, not redacted ones", () => {
  it("a secret-named upstream field reaches the approved action intact, with one approval", async () => {
    const channel = unique("C_M4");
    const { user, ws, slack, flowOf } = await setup("Redact");
    const flow = await flowOf(chain(trigger({ access_token: "tok-9f8e7d6c5b4a", name: "Ada" }), slackPost("post", slack.id, `{ "channel": "${channel}", "text": "ref " & access_token }`, { requireApproval: true }), out()));
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("waiting_approval");
    expect(JSON.stringify((await stepOf(run.id, "t")).output)).not.toContain("tok-9f8e7d6c5b4a"); // visible copy is redacted
    const [ap] = await db.select().from(schema.approval).where(eq(schema.approval.runId, run.id));
    await decide(db, { workspaceId: ws.id, approvalId: ap!.id, userId: user.id, decision: "approve" });
    await claimAndProcess(run.id);
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    expect(await posts(channel)).toEqual([expect.objectContaining({ text: "ref tok-9f8e7d6c5b4a" })]);
    expect(await db.select().from(schema.approval).where(eq(schema.approval.runId, run.id))).toHaveLength(1); // not superseded
    expect(done.attempts).toBe(0); // L4: resuming after an approval doesn't count as a lost worker
  });
});

describe("Low findings", () => {
  it("L1: OAuth reconnect can't target a connection of another provider", async () => {
    const { user, ws } = await setup("Provider");
    const zd = await createConnection(db, user.id, ws.id, "zendesk", "zd", { email: "agent@acme.test", token: "test-token", subdomain: "acme" });
    await expectHttpError(startOAuth(db, { userId: user.id, sessionToken: "test-session-token", workspaceId: ws.id, providerId: "slack", connectionId: zd.id }), 409, "DIFFERENT_PROVIDER");
  });

  it("L2: Zendesk subdomain and Snowflake URL can't point credentials elsewhere", async () => {
    const { user, ws } = await setup("Hosts");
    await expect(createConnection(db, user.id, ws.id, "zendesk", "zd", { email: "a@b.test", token: "test-token", subdomain: "evil.com/x?" })).rejects.toThrow(/subdomain/i);
    const sf = getProvider("snowflake")!;
    const bad = { type: "api_key" as const, token: "t", settings: { accountUrl: "https://evil.example.com" } };
    await expect(sf.identity({ http: {} as never, credentials: bad, signal: AbortSignal.timeout(1000), log: () => {} })).rejects.toThrow(/snowflakecomputing/);
  });

  it("L2: credentials are dropped on a cross-origin redirect", async () => {
    const seen: Record<string, string | undefined> = {};
    const target = createServer((req: IncomingMessage, res) => {
      seen.auth = req.headers.authorization;
      res.end("ok");
    });
    await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
    const tPort = (target.address() as AddressInfo).port;
    const origin = createServer((_req, res) => res.writeHead(302, { location: `http://127.0.0.1:${tPort}/landing` }).end());
    await new Promise<void>((r) => origin.listen(0, "127.0.0.1", r));
    const oPort = (origin.address() as AddressInfo).port;
    const allow = process.env.FLOWLINE_EGRESS_ALLOWLIST;
    process.env.FLOWLINE_EGRESS_ALLOWLIST = `${allow},127.0.0.1:${oPort},127.0.0.1:${tPort}`;
    try {
      const res = await safeFetch(`http://127.0.0.1:${oPort}/start`, { headers: { authorization: "Bearer secret-token" } });
      expect(res.status).toBe(200);
      expect(seen.auth).toBeUndefined();
    } finally {
      process.env.FLOWLINE_EGRESS_ALLOWLIST = allow;
      target.close();
      origin.close();
    }
  });

  it("L3: an approval-gated step can't use $now()/$random() in its input", async () => {
    const { user, slack, flowOf } = await setup("Unstable");
    const flow = await flowOf(chain(trigger({}), slackPost("post", slack.id, '{ "channel": "C1", "text": "at " & $now() }', { requireApproval: true }), out()));
    const e = await expectHttpError(enqueueRun(user, flow.id), 422);
    expect(JSON.stringify(e)).toContain("APPROVAL_UNSTABLE_INPUT");
  });
});
