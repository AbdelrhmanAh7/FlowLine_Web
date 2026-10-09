// TRIGGERS shard (jobs, no model): the ways a published flow starts without a person at the canvas — signed webhooks (dedupe, replay, rotation),
// the authenticated public API with scoped keys — plus the human-approval gate and the integration actions that run against the provider fakes.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { seeded } from "../lib.ts";
import { Http, N, E, actor, addMember, anonymous, chain, connect, createFlow, fakeOrigin, githubSignature, newFlow, serverNow, signWebhook, startRun, waitRun, withKey, type Graph } from "./_helpers.ts";

const finish = async (http: Http, flowId: string, input?: unknown) => {
  const started = await startRun(http, flowId, input);
  if (started.status !== 202) throw new Error(`run not accepted: ${started.status} ${started.text.slice(0, 300)}`);
  return waitRun(http, started.json.run.id);
};
const stepOf = (run: any, id: string) => run.steps.find((s: any) => s.nodeId === id);
const tokenOfHook = (url: string) => new URL(url).pathname.split("/").pop()!;
const nowSec = async () => Math.floor((await serverNow()).getTime() / 1000);

/** A published webhook flow: payload { lead: { name } } -> result { who, event }. */
async function webhookFlow(http: Http, wid: string, name: string, scheme?: "github") {
  const g: Graph = { nodes: [N.webhook({ body: { lead: { name: "Sample" } } }, "t", "Hook", scheme), N.transform("shape", '{ "who": body.lead.name, "event": event_id }'), N.output("out", "result")], edges: [E("t", "shape"), E("shape", "out")] };
  const f = await newFlow(http, wid, name, g);
  const pub = await http.post(`/api/flows/${f.id}/publish`);
  if (pub.status !== 201) throw new Error(`publish ${pub.status}: ${pub.text.slice(0, 300)}`);
  return { flow: f, token: tokenOfHook(pub.json.webhook.url), secret: pub.json.webhook.secret as string, url: pub.json.webhook.url as string };
}
async function deliver(token: string, body: string, eventId: string, secret: string, opts: { t?: number; headers?: Record<string, string> } = {}) {
  const t = opts.t ?? (await nowSec());
  return anonymous().post(`/api/hooks/${token}`, { body, headers: { "content-type": "application/json", "x-flowline-event-id": eventId, "x-flowline-signature": signWebhook(secret, body, eventId, t), ...(opts.headers ?? {}) } });
}

// ── fl-trigger-webhook ───────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-trigger-webhook.1] a correctly signed delivery starts a run with its payload; the same event id is not run twice", { tags: ["feat:fl-trigger-webhook", "shard:triggers", "lvl:job"] }, async () => {
  const { a, http } = await actor("hook-owner");
  const h = await webhookFlow(http, a.workspaceId, `Hook ${seeded("hook-1", 4)}`);
  expect(h.secret).toMatch(/^whsec_/);
  expect(new URL(h.url).pathname).toMatch(/^\/api\/hooks\/[A-Za-z0-9_-]+$/);
  const body = JSON.stringify({ lead: { name: "Ada Lovelace" } });
  const ev = seeded("evt", 10);
  const first = await deliver(h.token, body, ev, h.secret);
  expect(first.status).toBe(202);
  expect(first.json).toMatchObject({ accepted: true });
  const run = await waitRun(http, first.json.runId);
  expect(run.status).toBe("succeeded");
  expect(run).toMatchObject({ triggerKind: "webhook", triggerRef: ev });
  expect(run.input.body).toEqual({ lead: { name: "Ada Lovelace" } });
  expect(run.output).toEqual({ result: { who: "Ada Lovelace", event: ev } });
  const dup = await deliver(h.token, body, ev, h.secret);
  expect(dup.status).toBe(200);
  expect(dup.json).toMatchObject({ duplicate: true, runId: first.json.runId });
  const conflicting = await deliver(h.token, JSON.stringify({ lead: { name: "Someone Else" } }), ev, h.secret);
  expect(conflicting.status).toBe(409);
  const info = (await http.get(`/api/flows/${h.flow.id}/publish`)).json;
  expect(info.webhook.active).toBe(true);
  expect(info.webhook.recentEvents.filter((e: any) => e.eventId === ev)).toHaveLength(1);
  expect(info.webhook.recentEvents[0]).toMatchObject({ eventId: ev, status: "accepted", runId: first.json.runId });
  const runs = (await http.get(`/api/flows/${h.flow.id}/runs`)).json.runs as { id: string }[];
  expect(runs.filter((r) => r.id === first.json.runId)).toHaveLength(1);
});

test("[fl-trigger-webhook.2] unsigned, wrongly signed, stale, malformed and oversized deliveries are refused and start nothing", { tags: ["feat:fl-trigger-webhook", "shard:triggers", "lvl:job"] }, async () => {
  const { a, http } = await actor("hook-owner-2");
  const h = await webhookFlow(http, a.workspaceId, `Hook refuse ${seeded("hook-2", 4)}`);
  const body = JSON.stringify({ lead: { name: "Ada" } });
  const t = await nowSec();
  const post = (headers: Record<string, string>, payload = body, token = h.token) => anonymous().post(`/api/hooks/${token}`, { body: payload, headers: { "content-type": "application/json", ...headers } });
  expect((await post({ "x-flowline-event-id": "no-sig-1" })).status).toBe(401);
  expect((await post({ "x-flowline-event-id": "bad-sig-1", "x-flowline-signature": signWebhook("whsec_wrong", body, "bad-sig-1", t) })).status).toBe(401);
  const stale = await deliver(h.token, body, "stale-1", h.secret, { t: t - 4000 });
  expect(stale.status).toBe(401);
  expect(stale.json.error).toMatch(/tolerance/);
  const tampered = await post({ "x-flowline-event-id": "tamper-1", "x-flowline-signature": signWebhook(h.secret, body, "tamper-1", t) }, JSON.stringify({ lead: { name: "Mallory" } }));
  expect(tampered.status).toBe(401);
  expect((await post({ "x-flowline-signature": signWebhook(h.secret, body, "", t) })).status).toBe(400);
  expect((await deliver("not-a-real-token-at-all", body, "unknown-1", h.secret)).status).toBe(404);
  const notJson = "{nope";
  expect((await deliver(h.token, notJson, "not-json-1", h.secret)).status).toBe(400);
  const huge = await post({ "x-flowline-event-id": "huge-1", "x-flowline-signature": "t=1,v1=00" }, JSON.stringify({ blob: "x".repeat(300 * 1024) }));
  expect(huge.status).toBe(413);
  expect(huge.json.code).toBe("PAYLOAD_TOO_LARGE");
  const runs = (await http.get(`/api/flows/${h.flow.id}/runs`)).json.runs as unknown[];
  expect(runs).toHaveLength(0);
});

test("[fl-trigger-webhook.3] rotating the secret retires the old one at once, GitHub-style signatures work and cannot be replayed, and unpublishing closes the endpoint", { tags: ["feat:fl-trigger-webhook", "shard:triggers", "lvl:job"] }, async () => {
  const { a, http } = await actor("hook-owner-3");
  const h = await webhookFlow(http, a.workspaceId, `Hook rotate ${seeded("hook-3", 4)}`);
  const body = JSON.stringify({ lead: { name: "Rotated" } });
  const rotated = await http.post(`/api/flows/${h.flow.id}/webhook/rotate`);
  expect(rotated.status).toBe(200);
  expect(rotated.json.secret).toMatch(/^whsec_/);
  expect(rotated.json.secret).not.toBe(h.secret);
  expect(rotated.json.url).toBe(h.url);
  expect((await deliver(h.token, body, "old-secret-1", h.secret)).status).toBe(401);
  const fresh = await deliver(h.token, body, "new-secret-1", rotated.json.secret);
  expect(fresh.status).toBe(202);
  await waitRun(http, fresh.json.runId);
  const gh = await webhookFlow(http, a.workspaceId, `Hook github ${seeded("hook-3g", 4)}`, "github");
  const ghBody = JSON.stringify({ lead: { name: "Octo Cat" } });
  const ghHeaders = (delivery: string, secret = gh.secret) => ({ "content-type": "application/json", "x-github-delivery": delivery, "x-hub-signature-256": githubSignature(secret, ghBody) });
  expect((await anonymous().post(`/api/hooks/${gh.token}`, { body: ghBody, headers: ghHeaders("gh-1", "whsec_wrong") })).status).toBe(401);
  const ok = await anonymous().post(`/api/hooks/${gh.token}`, { body: ghBody, headers: ghHeaders("gh-1") });
  expect(ok.status).toBe(202);
  expect((await waitRun(http, ok.json.runId)).output).toEqual({ result: { who: "Octo Cat", event: "gh-1" } });
  const replay = await anonymous().post(`/api/hooks/${gh.token}`, { body: ghBody, headers: ghHeaders("gh-2") });
  expect(replay.status).toBe(409);
  expect(replay.json.error).toMatch(/replay/i);
  expect((await http.del(`/api/flows/${h.flow.id}/publish`)).status).toBe(200);
  const closed = await deliver(h.token, body, "after-unpublish-1", rotated.json.secret);
  expect(closed.status).toBe(404);
  expect((await http.get(`/api/flows/${h.flow.id}/publish`)).json.webhook.active).toBe(false);
  expect((await http.post(`/api/flows/${(await createFlow(http, a.workspaceId, { name: `No hook ${seeded("hook-3n", 4)}` })).id}/webhook/rotate`)).status).toBe(404);
});

// ── fl-public-api-v1 ─────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-public-api-v1.1] the public API authenticates a Bearer key, lists the workspace's flows and enforces scopes and revocation", { tags: ["feat:fl-public-api-v1", "shard:triggers", "lvl:api"] }, async () => {
  const { a, http } = await actor("v1-owner");
  const f = await newFlow(http, a.workspaceId, `V1 flow ${seeded("v1-flow", 4)}`, chain({ n: 1 }, "$"));
  const mint = async (mode: "test" | "live", scopes: string[]) => (await http.post(`/api/workspaces/${a.workspaceId}/api-keys`, { json: { name: `V1 ${mode} ${seeded(scopes.join(), 4)}`, mode, scopes } })).json;
  const full = await mint("test", ["flows:read", "runs:read", "runs:write"]);
  const listed = await withKey(full.key).get("/api/v1/flows");
  expect(listed.status).toBe(200);
  expect(listed.json.flows.find((x: any) => x.id === f.id)).toMatchObject({ name: f.name, publishedVersion: null, trigger: "trigger.manual", paused: false });
  expect((await anonymous().get("/api/v1/flows")).json.error.code).toBe("API_KEY_REQUIRED");
  expect((await http.get("/api/v1/flows")).status).toBe(401);
  expect((await withKey("nope").get("/api/v1/flows")).json.error.code).toBe("API_KEY_INVALID");
  expect((await withKey(`fl_test_aaaaaaaa_${"A".repeat(43)}`).get("/api/v1/flows")).json.error.code).toBe("API_KEY_INVALID");
  const readOnly = await mint("test", ["flows:read"]);
  const denied = await withKey(readOnly.key).post(`/api/v1/flows/${f.id}/runs`, { json: {} });
  expect(denied.status).toBe(403);
  expect(denied.json.error.code).toBe("INSUFFICIENT_SCOPE");
  expect((await withKey(readOnly.key).get(`/api/v1/runs/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}`)).json.error.code).toBe("INSUFFICIENT_SCOPE");
  expect((await http.del(`/api/workspaces/${a.workspaceId}/api-keys/${full.apiKey.id}`)).status).toBe(200);
  const revoked = await withKey(full.key).get("/api/v1/flows");
  expect(revoked.status).toBe(401);
  expect(revoked.json.error.code).toBe("API_KEY_REVOKED");
});

test("[fl-public-api-v1.2] a test key runs the current draft, a live key only the published version; idempotency keys and tenant walls hold", { tags: ["feat:fl-public-api-v1", "shard:triggers", "lvl:job"] }, async () => {
  const { a, http } = await actor("v1-owner-2");
  const other = await actor("v1-other");
  const graph = (v: string): Graph => ({ nodes: [N.manual({ x: 1 }), N.transform("shape", `{ "v": "${v}", "x": x }`), N.output("out", "result")], edges: [E("t", "shape"), E("shape", "out")] });
  const f = await newFlow(http, a.workspaceId, `V1 runs ${seeded("v1-runs", 4)}`, graph("published"));
  const mint = async (mode: "test" | "live") => (await http.post(`/api/workspaces/${a.workspaceId}/api-keys`, { json: { name: `V1 runs ${mode}`, mode, scopes: ["runs:write", "runs:read", "flows:read"] } })).json.key as string;
  const [testKey, liveKey] = [await mint("test"), await mint("live")];
  const notPublished = await withKey(liveKey).post(`/api/v1/flows/${f.id}/runs`, { json: {} });
  expect(notPublished.status).toBe(409);
  expect(notPublished.json.error.code).toBe("NOT_PUBLISHED");
  expect((await http.post(`/api/flows/${f.id}/publish`)).status).toBe(201);
  const draft = (await http.get(`/api/flows/${f.id}`)).json.flow;
  expect((await http.put(`/api/flows/${f.id}`, { json: { baseRevision: draft.revision, graph: graph("draft") } })).status).toBe(200);
  const live = await withKey(liveKey).post(`/api/v1/flows/${f.id}/runs`, { json: { input: { x: 7 } } });
  expect(live.status).toBe(202);
  expect(live.json).toMatchObject({ status: "queued", duplicate: false });
  expect(live.json.statusUrl).toBe(`/api/v1/runs/${live.json.id}`);
  await expect.poll(async () => (await withKey(liveKey).get(live.json.statusUrl)).json.status, { timeout: 30_000, interval: 400 }).toBe("succeeded");
  const liveDone = (await withKey(liveKey).get(live.json.statusUrl)).json;
  expect(liveDone.output).toEqual({ result: { v: "published", x: 7 } });
  expect(liveDone.steps.map((s: any) => [s.nodeId, s.status])).toEqual([["t", "succeeded"], ["shape", "succeeded"], ["out", "succeeded"]]);
  const testRun = await withKey(testKey).post(`/api/v1/flows/${f.id}/runs`, { json: { input: { x: 8 } } });
  await expect.poll(async () => (await withKey(testKey).get(testRun.json.statusUrl)).json.status, { timeout: 30_000, interval: 400 }).toBe("succeeded");
  expect((await withKey(testKey).get(testRun.json.statusUrl)).json.output).toEqual({ result: { v: "draft", x: 8 } });
  const idem = { "idempotency-key": seeded("v1-idem", 10) };
  const one = await withKey(testKey).post(`/api/v1/flows/${f.id}/runs`, { json: { input: { x: 9 } }, headers: idem });
  const two = await withKey(testKey).post(`/api/v1/flows/${f.id}/runs`, { json: { input: { x: 9 } }, headers: idem });
  expect(one.status).toBe(202);
  expect(two.status).toBe(200);
  expect(two.json).toMatchObject({ duplicate: true, id: one.json.id });
  expect((await withKey(testKey).post(`/api/v1/flows/${f.id}/runs`, { json: { unknown: 1 } })).status).toBe(400);
  expect((await withKey(testKey).post(`/api/v1/flows/${f.id}/runs`, { json: { input: "text" } })).status).toBe(400);
  const foreign = await http.post(`/api/workspaces/${other.a.workspaceId}/api-keys`, { json: { name: "x", mode: "test", scopes: ["runs:read"] } });
  expect(foreign.status).toBe(404);
  const otherKey = (await other.http.post(`/api/workspaces/${other.a.workspaceId}/api-keys`, { json: { name: "other", mode: "test", scopes: ["runs:read", "runs:write"] } })).json.key as string;
  expect((await withKey(otherKey).get(`/api/v1/runs/${live.json.id}`)).status).toBe(404);
  expect((await withKey(otherKey).post(`/api/v1/flows/${f.id}/runs`, { json: {} })).status).toBe(404);
});

// ── fl-approvals ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function gatedFlow(http: Http, wid: string, label: string, text: string) {
  const conn = await connect(http, wid, "slack", `Slack ${label}`);
  const g: Graph = { nodes: [N.manual({}), N.action("post", "slack.post_message", conn.id, JSON.stringify({ channel: "C001GEN", text }), true), N.output("o", "sent")], edges: [E("t", "post"), E("post", "o")] };
  return newFlow(http, wid, `Gated ${label}`, g);
}
test("[fl-approvals.1] a gated action waits for a human: viewers cannot decide, an owner approves, and the action runs exactly once", { tags: ["feat:fl-approvals", "shard:triggers", "lvl:job"] }, async () => {
  const owner = await actor("appr-owner");
  const viewer = await addMember(owner, "appr-viewer", "viewer");
  const text = `Approved ${seeded("appr-text", 8)}`;
  const f = await gatedFlow(owner.http, owner.a.workspaceId, seeded("appr-1", 4), text);
  const fake = await fakeOrigin(owner.http, owner.a.workspaceId);
  const started = await startRun(owner.http, f.id);
  const waiting = await waitRun(owner.http, started.json.run.id, ["waiting_approval"]);
  expect(stepOf(waiting, "post").status).toBe("waiting_approval");
  expect(waiting.approvals[0]).toMatchObject({ status: "pending", actionId: "slack.post_message", kind: "approval" });
  expect(waiting.approvals[0].argsPreview).toEqual({ channel: "C001GEN", text });
  const pending = (await owner.http.get(`/api/workspaces/${owner.a.workspaceId}/approvals`)).json.approvals as any[];
  const mine = pending.find((p) => p.runId === started.json.run.id);
  expect(mine).toMatchObject({ actionId: "slack.post_message", flowName: f.name, nodeId: "post" });
  expect((await owner.http.get(`/api/workspaces/${owner.a.workspaceId}/overview`)).json.pendingApprovals).toBeGreaterThanOrEqual(1);
  const denied = await viewer.http.post(`/api/approvals/${mine.id}/decide`, { json: { decision: "approve" } });
  expect(denied.status).toBe(403);
  expect(((await viewer.http.get(`/api/workspaces/${owner.a.workspaceId}/approvals`)).json.approvals as any[]).some((p) => p.id === mine.id)).toBe(true);
  const sentBefore = ((await (await fetch(`${fake}/__fake/state/slack`)).json()).messages as { text: string }[]).filter((m) => m.text === text).length;
  expect(sentBefore).toBe(0);
  expect((await owner.http.post(`/api/approvals/${mine.id}/decide`, { json: { decision: "approve", note: "ok" } })).status).toBe(200);
  const done = await waitRun(owner.http, started.json.run.id);
  expect(done.status).toBe("succeeded");
  expect(done.output.sent).toMatchObject({ channel: "C001GEN" });
  expect(done.output.sent.ts).toMatch(/^\d+\.\d{6}$/);
  const sent = ((await (await fetch(`${fake}/__fake/state/slack`)).json()).messages as { text: string }[]).filter((m) => m.text === text);
  expect(sent).toHaveLength(1);
  expect(((await owner.http.get(`/api/runs/${started.json.run.id}`)).json.run.approvals as any[])[0].status).toBe("approved");
  const log = (await owner.http.get(`/api/workspaces/${owner.a.workspaceId}/audit`)).json.events as { action: string }[];
  expect(log.some((e) => e.action === "approval.decided")).toBe(true);
});

test("[fl-approvals.2] a rejected action never runs and fails the run; cancelling a waiting run withdraws its approval", { tags: ["feat:fl-approvals", "shard:triggers", "lvl:job"] }, async () => {
  const { a, http } = await actor("appr-owner-2");
  const text = `Rejected ${seeded("appr-text-2", 8)}`;
  const f = await gatedFlow(http, a.workspaceId, seeded("appr-2", 4), text);
  const fake = await fakeOrigin(http, a.workspaceId);
  const r1 = await startRun(http, f.id);
  const w1 = await waitRun(http, r1.json.run.id, ["waiting_approval"]);
  const decide = await http.post(`/api/approvals/${w1.approvals[0].id}/decide`, { json: { decision: "reject", note: "not today" } });
  expect(decide.status).toBe(200);
  const failed = await waitRun(http, r1.json.run.id);
  expect(failed.status).toBe("failed");
  expect(stepOf(failed, "post").error).toMatchObject({ code: "APPROVAL_REJECTED" });
  expect(stepOf(failed, "post").error.message).toContain("not today");
  expect(((await (await fetch(`${fake}/__fake/state/slack`)).json()).messages as { text: string }[]).some((m) => m.text === text)).toBe(false);
  const r2 = await startRun(http, f.id);
  const w2 = await waitRun(http, r2.json.run.id, ["waiting_approval"]);
  expect((await http.post(`/api/runs/${r2.json.run.id}/cancel`)).json.status).toBe("cancelled");
  const cancelled = (await http.get(`/api/runs/${r2.json.run.id}`)).json.run;
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.approvals[0].status).toBe("superseded");
  const late = await http.post(`/api/approvals/${w2.approvals[0].id}/decide`, { json: { decision: "approve" } });
  expect([404, 409, 410, 422]).toContain(late.status);
  expect((await http.post(`/api/approvals/${w2.approvals[0].id}/decide`, { json: { decision: "maybe" } })).status).toBe(400);
});

// ── fl-integration-actions ───────────────────────────────────────────────────────────────────────────────────────────
test("[fl-integration-actions.1] app actions run against the provider with the stored connection, validate their input and refuse the wrong connection", { tags: ["feat:fl-integration-actions", "shard:triggers", "lvl:job"] }, async () => {
  const { a, http } = await actor("actions-owner");
  const slack = await connect(http, a.workspaceId, "slack", `Slack ${seeded("act-slack", 4)}`);
  const sheets = await connect(http, a.workspaceId, "google_sheets", `Sheets ${seeded("act-sheets", 4)}`);
  const fake = await fakeOrigin(http, a.workspaceId);
  const text = `Hello ${seeded("act-text", 8)}`;
  const g: Graph = { nodes: [N.manual({}), N.action("channels", "slack.list_channels", slack.id, '{ "limit": 10 }', false, 300), N.action("post", "slack.post_message", slack.id, JSON.stringify({ channel: "C002RND", text }), false, 300), N.output("o1", "channels", "", 900, "o1", 40), N.output("o2", "posted", "", 900, "o2", 220)],
    edges: [E("t", "channels"), E("t", "post"), E("channels", "o1"), E("post", "o2")] };
  const f = await newFlow(http, a.workspaceId, `Actions ${seeded("act-flow", 4)}`, g);
  expect((await http.get(`/api/flows/${f.id}`)).json.issues).toEqual([]);
  const run = await finish(http, f.id);
  expect(run.status).toBe("succeeded");
  expect(run.output.channels.channels.map((c: any) => c.name)).toEqual(expect.arrayContaining(["general", "random"]));
  expect(run.output.posted).toMatchObject({ channel: "C002RND" });
  expect(stepOf(run, "post").meta).toMatchObject({ provider: "slack", action: "slack.post_message", sideEffect: "non_idempotent" });
  expect(JSON.stringify(run)).not.toContain("test-token");
  const msgs = ((await (await fetch(`${fake}/__fake/state/slack`)).json()).messages as { text: string; channel: string }[]).filter((m) => m.text === text);
  expect(msgs).toEqual([expect.objectContaining({ channel: "C002RND" })]);
  const invalid = await newFlow(http, a.workspaceId, `Actions bad input ${seeded("act-bad", 4)}`, { nodes: [N.manual({}), N.action("post", "slack.post_message", slack.id, '{ "channel": "C001GEN" }'), N.output("o", "x")], edges: [E("t", "post"), E("post", "o")] });
  const badRun = await finish(http, invalid.id);
  expect(badRun.status).toBe("failed");
  expect(stepOf(badRun, "post").error).toMatchObject({ code: "INVALID_INPUT" });
  expect(stepOf(badRun, "post").error.message).toMatch(/text/);
  const noConn = await newFlow(http, a.workspaceId, `Actions no connection ${seeded("act-none", 4)}`, { nodes: [N.manual({}), N.action("post", "slack.post_message", "", '{ "channel": "C001GEN", "text": "x" }'), N.output("o", "x")], edges: [E("t", "post"), E("post", "o")] });
  expect((await startRun(http, noConn.id)).status).toBe(422);
  expect(JSON.stringify((await http.get(`/api/flows/${noConn.id}`)).json.issues)).toContain("MISSING_CONNECTION");
  const wrong = await newFlow(http, a.workspaceId, `Actions wrong connection ${seeded("act-wrong", 4)}`, { nodes: [N.manual({}), N.action("post", "slack.post_message", sheets.id, '{ "channel": "C001GEN", "text": "x" }'), N.output("o", "x")], edges: [E("t", "post"), E("post", "o")] });
  const pub = await http.post(`/api/flows/${wrong.id}/publish`);
  expect(pub.status).toBe(422);
  expect(JSON.stringify(pub.json.error.details)).toContain("WRONG_CONNECTION");
  const wrongRun = await finish(http, wrong.id);
  expect(wrongRun.status).toBe("failed");
  expect(stepOf(wrongRun, "post").error.code).toBe("CONNECTION_PROVIDER");
});
