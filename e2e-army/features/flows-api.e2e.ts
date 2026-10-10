// FLOWS API shard (no model): flow CRUD and concurrency, graph validation, version history and rollback, sharing, publishing, templates and
// localized template content. Request-level only; the browser is never needed.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { seeded } from "../lib.ts";
import { Http, actor, addMember, anonymous, chain, clientOf, createFlow, E, N, newFlow, startRun, uuidRe, waitRun, type Graph, type Json } from "./_helpers.ts";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

// ── fl-flows-api ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-flows-api.1] a flow is created, listed with its summary, renamed, saved and deleted", { tags: ["feat:fl-flows-api", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-crud");
  const w = `/api/workspaces/${a.workspaceId}`;
  const name = `Flow ${seeded("flow-crud", 4)}`;
  const f = await createFlow(http, a.workspaceId, { name });
  expect(f.id).toMatch(uuidRe);
  expect(f.name).toBe(name);
  expect(f.graph).toEqual({ nodes: [], edges: [] });
  const fresh = (await http.get(`/api/flows/${f.id}`)).json;
  expect(fresh.role).toBe("owner");
  expect(fresh.workspace).toMatchObject({ id: a.workspaceId, slug: a.slug });
  expect(codes(fresh.issues)).toEqual(["EMPTY_FLOW"]);
  const renamed = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision, name: `${name} v2` } });
  expect(renamed.status).toBe(200);
  expect(renamed.json.flow.name).toBe(`${name} v2`);
  expect(renamed.json.flow.revision).toBe(f.revision + 1);
  expect(renamed.json.version).toBeNull();
  const saved = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: renamed.json.flow.revision, graph: chain({ n: 1 }, "$") } });
  expect(saved.json.issues).toEqual([]);
  const row = ((await http.get(`${w}/flows`)).json.flows as Json[]).find((x) => x.id === f.id);
  expect(row).toMatchObject({ name: `${name} v2`, nodeCount: 3, trigger: "trigger.manual", hasTrigger: true, publishedVersion: null, runCount: 0, lastRunStatus: null });
  expect((await http.post(`${w}/flows`, { json: { name: "" } })).status).toBe(400);
  expect((await http.post(`${w}/flows`, { json: { name: "n".repeat(81) } })).status).toBe(400);
  expect((await http.post(`${w}/flows`, { json: { templateId: "no-such-template" } })).json.error.code).toBe("UNKNOWN_TEMPLATE");
  expect((await http.get("/api/flows/not-a-uuid")).status).toBe(404);
  expect((await http.del(`/api/flows/${f.id}`)).json).toEqual({ ok: true });
  expect((await http.get(`/api/flows/${f.id}`)).status).toBe(404);
  expect(((await http.get(`${w}/flows`)).json.flows as Json[]).some((x) => x.id === f.id)).toBe(false);
  expect((await startRun(http, f.id)).status).toBe(404);
});

test("[fl-flows-api.2] a save from a stale copy is refused with the server copy; an explicit overwrite keeps the old one as a version", { tags: ["feat:fl-flows-api", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-conflict");
  const f = await newFlow(http, a.workspaceId, `Conflict ${seeded("flow-conflict", 4)}`, chain({ n: 1 }, "$"));
  const mine: Graph = chain({ n: 2 }, "$");
  const stale = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision - 1, graph: mine } });
  expect(stale.status).toBe(409);
  expect(stale.json.error.code).toBe("REVISION_CONFLICT");
  expect(stale.json.error.details).toMatchObject({ serverRevision: f.revision, serverName: f.name });
  expect(stale.json.error.details.serverGraph).toEqual(f.graph);
  expect((await http.get(`/api/flows/${f.id}`)).json.flow.revision).toBe(f.revision);
  const forced = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision - 1, graph: mine, force: true } });
  expect(forced.status).toBe(200);
  expect(forced.json.flow.revision).toBe(f.revision + 1);
  expect(forced.json.flow.graph).toEqual(mine);
  const versions = (await http.get(`/api/flows/${f.id}/versions`)).json.versions as { reason: string }[];
  expect(versions.map((v) => v.reason)).toContain("overwrite");
  const explicit = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: forced.json.flow.revision, graph: mine, createVersion: true } });
  expect(explicit.json.version.reason).toBe("save");
});

test("[fl-flows-api.3] malformed graphs and saves are rejected before they reach the database", { tags: ["feat:fl-flows-api", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-schema");
  const f = await createFlow(http, a.workspaceId, { name: `Schema ${seeded("flow-schema", 4)}` });
  const put = (body: unknown) => http.put(`/api/flows/${f.id}`, { json: body });
  expect((await put({ graph: chain({}, "$") })).status).toBe(400);
  expect((await put({ baseRevision: f.revision, graph: { nodes: [{ id: "x", type: "trigger.teleport", position: { x: 0, y: 0 }, data: { label: "x", config: {} } }], edges: [] } })).status).toBe(400);
  expect((await put({ baseRevision: f.revision, graph: { nodes: [{ id: "x", type: "output", position: { x: 0, y: 0 }, data: { label: "l".repeat(81), config: {} } }], edges: [] } })).status).toBe(400);
  const many = Array.from({ length: 101 }, (_, i) => N.transform(`n${i}`, "$", i));
  expect((await put({ baseRevision: f.revision, graph: { nodes: many, edges: [] } })).status).toBe(400);
  expect((await put({ baseRevision: f.revision, name: "n".repeat(81) })).status).toBe(400);
  expect((await put({ baseRevision: 0 })).status).toBe(400);
  expect((await anonymous().put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision } })).status).toBe(401);
  expect((await http.get(`/api/flows/${f.id}`)).json.flow.revision).toBe(f.revision);
});

// ── fl-flows-list (api level) ────────────────────────────────────────────────────────────────────────────────────────
test("[fl-flows-list.3] the flow list and the dashboard numbers summarise each flow's last run, success rate and publication", { tags: ["feat:fl-flows-list", "shard:flows-api", "lvl:api"] }, async () => {
  const { http } = await actor("flows-list-api");
  const ws = (await http.post("/api/workspaces", { json: { name: `List ${seeded("flows-list-ws", 4)}` } })).json.workspace;
  const w = `/api/workspaces/${ws.id}`;
  expect(((await http.get(`${w}/flows`)).json.flows as unknown[]).length).toBe(0);
  const good = await newFlow(http, ws.id, `Listed good ${seeded("fl-list-good", 3)}`, chain({ n: 1 }, "$"));
  const bad = await newFlow(http, ws.id, `Listed bad ${seeded("fl-list-bad", 3)}`, chain({ n: 1 }, '$number("x")'));
  const draft = await createFlow(http, ws.id, { name: `Listed draft ${seeded("fl-list-draft", 3)}` });
  for (const id of [good.id, good.id, bad.id]) {
    const run = await startRun(http, id);
    await waitRun(http, run.json.run.id);
  }
  expect((await http.post(`/api/flows/${good.id}/publish`)).status).toBe(201);
  const rows = (await http.get(`${w}/flows`)).json.flows as Json[];
  expect(rows).toHaveLength(3);
  const row = (id: string) => rows.find((r) => r.id === id);
  expect(row(good.id)).toMatchObject({ runCount: 2, lastRunStatus: "succeeded", successRate: 1, publishedVersion: 1, nodeCount: 3, trigger: "trigger.manual" });
  expect(row(bad.id)).toMatchObject({ runCount: 1, lastRunStatus: "failed", successRate: 0, publishedVersion: null });
  expect(row(draft.id)).toMatchObject({ runCount: 0, lastRunStatus: null, successRate: null, nodeCount: 0, hasTrigger: false });
  expect(rows.map((r) => r.updatedAt)).toEqual([...rows.map((r) => r.updatedAt)].sort().reverse());
  const overview = (await http.get(`${w}/overview`)).json;
  expect(overview).toMatchObject({ flows: 3, flowsRun24h: 2, runs24h: 3, failed24h: 1, activeRuns: 0 });
  expect(overview.successRate24h).toBeCloseTo(2 / 3, 5);
  expect(overview.recent).toHaveLength(3);
});

// ── fl-flow-validation ───────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-flow-validation.1] a broken flow lists exactly what is wrong, and neither runs nor publishes", { tags: ["feat:fl-flow-validation", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-validate");
  const cases: { name: string; graph: Graph; expect: string[]; message?: RegExp }[] = [
    { name: "trigger only", graph: { nodes: [N.manual()], edges: [] }, expect: ["NO_STEPS"] },
    { name: "no trigger", graph: { nodes: [N.transform("a", "$", 0)], edges: [] }, expect: ["NO_TRIGGER", "UNCONNECTED_INPUT"] },
    { name: "two triggers", graph: { nodes: [N.manual({}, "t1"), N.manual({}, "t2"), N.output("o", "r", "", 300)], edges: [E("t1", "o")] }, expect: ["MULTIPLE_TRIGGERS"] },
    { name: "bad expression", graph: chain({}, "1 +"), expect: ["INVALID_EXPRESSION"] },
    { name: "empty expression", graph: chain({}, "   "), expect: ["EMPTY_EXPRESSION"] },
    { name: "unconnected output", graph: { nodes: [N.manual(), N.transform("s", "$"), N.output("o", "r")], edges: [E("t", "s")] }, expect: ["UNCONNECTED_INPUT"] },
    { name: "duplicate output key", graph: { nodes: [N.manual(), N.output("o1", "same", "", 300, "o1", 0), N.output("o2", "same", "", 300, "o2", 200)], edges: [E("t", "o1"), E("t", "o2")] }, expect: ["DUPLICATE_OUTPUT_KEY"] },
    { name: "reference to a missing step", graph: { nodes: [N.manual(), N.transform("s", "$steps.ghost"), N.output("o", "r")], edges: [E("t", "s"), E("s", "o")] }, expect: ["UNKNOWN_REFERENCE"] },
    { name: "two inputs into one node", graph: { nodes: [N.manual(), N.transform("a", "$", 300), N.transform("b", "$", 300), N.transform("c", "$", 600), N.output("o", "r")], edges: [E("t", "a"), E("t", "b"), E("a", "c"), E("b", "c"), E("c", "o")] }, expect: ["INVALID_EDGE"], message: /already has an input/ },
    { name: "a loop", graph: { nodes: [N.manual(), N.transform("a", "$", 300), N.transform("b", "$", 600), N.output("o", "r")], edges: [E("t", "a"), E("a", "b"), E("b", "a"), E("b", "o")] }, expect: ["INVALID_EDGE"] },
    { name: "schedule too frequent", graph: { nodes: [N.schedule("* * * * *"), N.transform("s", "$"), N.output("o", "r")], edges: [E("t", "s"), E("s", "o")] }, expect: ["INVALID_SCHEDULE"], message: /every 5 minutes/ },
    { name: "template placeholder", graph: chain({}, "$REPLACE_WITH_SPREADSHEET_ID"), expect: ["SETUP_REQUIRED"] },
  ];
  for (const c of cases) {
    const f = await newFlow(http, a.workspaceId, `Validate ${seeded(c.name, 4)}`, c.graph);
    const got = (await http.get(`/api/flows/${f.id}`)).json.issues as { code: string; message: string }[];
    for (const code of c.expect) expect(codes(got), c.name).toContain(code);
    if (c.message) expect(got.map((i) => i.message).join(" | "), c.name).toMatch(c.message);
    const run = await startRun(http, f.id);
    expect(run.status, `${c.name} run`).toBe(422);
    expect(run.json.error.code).toBe("INVALID_FLOW");
    expect(run.json.error.details.length).toBeGreaterThan(0);
    const pub = await http.post(`/api/flows/${f.id}/publish`);
    expect(pub.status, `${c.name} publish`).toBe(422);
    expect(pub.json.error.code).toBe("INVALID_FLOW");
  }
  const ok = await newFlow(http, a.workspaceId, `Validate ok ${seeded("validate-ok", 4)}`, chain({ a: 1 }, "$"));
  expect((await http.get(`/api/flows/${ok.id}`)).json.issues).toEqual([]);
});

// ── fl-flow-versions ─────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-flow-versions.1] saved versions are immutable history and an old one can be restored as a new draft without losing history", { tags: ["feat:fl-flow-versions", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-versions");
  const v1: Graph = chain({ step: "first" }, "$");
  const f = await newFlow(http, a.workspaceId, `Versions ${seeded("flow-versions", 4)}`, v1, { createVersion: true });
  const second = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision, graph: chain({ step: "second" }, "$"), createVersion: true } });
  expect(second.status).toBe(200);
  const list = (await http.get(`/api/flows/${f.id}/versions`)).json.versions as { id: string; version: number; reason: string }[];
  expect(list.map((v) => v.version)).toEqual([2, 1]);
  expect(list.every((v) => v.reason === "save")).toBe(true);
  const oldest = list[list.length - 1]!;
  const detail = (await http.get(`/api/flows/${f.id}/versions/${oldest.id}`)).json.version;
  expect(detail.graph).toEqual(v1);
  expect((await http.get(`/api/flows/${f.id}/versions/${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`)).status).toBe(404);
  expect((await http.get(`/api/flows/${f.id}/versions/not-a-uuid`)).status).toBe(404);
  const stale = await http.post(`/api/flows/${f.id}/versions/${oldest.id}/restore`, { json: { baseRevision: f.revision } });
  expect(stale.status).toBe(409);
  const restored = await http.post(`/api/flows/${f.id}/versions/${oldest.id}/restore`, { json: { baseRevision: second.json.flow.revision } });
  expect(restored.status).toBe(200);
  expect(restored.json).toMatchObject({ published: false, flow: { id: f.id, revision: second.json.flow.revision + 1 } });
  expect((await http.get(`/api/flows/${f.id}`)).json.flow.graph).toEqual(v1);
  expect(((await http.get(`/api/flows/${f.id}/versions`)).json.versions as unknown[]).length).toBeGreaterThanOrEqual(2);
  const rolled = await http.post(`/api/flows/${f.id}/versions/${oldest.id}/restore`, { json: { baseRevision: restored.json.flow.revision, publish: true } });
  expect(rolled.json.published).toBe(true);
  expect((await http.get(`/api/flows/${f.id}/publish`)).json.publishedVersionId).not.toBeNull();
});

// ── fl-flow-share ────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-flow-share.1] sharing copies a flow into another workspace without any connection, and needs edit rights there", { tags: ["feat:fl-flow-share", "shard:flows-api", "lvl:api"] }, async () => {
  const owner = await actor("flows-share");
  const other = (await owner.http.post("/api/workspaces", { json: { name: `Share target ${seeded("share-target", 4)}` } })).json.workspace;
  const stranger = await actor("flows-share-stranger");
  const ghostConnection = "11111111-1111-4111-8111-111111111111";
  const graph: Graph = { nodes: [N.manual({ x: 1 }), N.action("send", "slack.post_message", ghostConnection, '{ "channel": "C1", "text": "hi" }'), N.output("o", "r")], edges: [E("t", "send"), E("send", "o")] };
  const f = await newFlow(owner.http, owner.a.workspaceId, `Shared ${seeded("share-src", 4)}`, graph);
  const shared = await owner.http.post(`/api/flows/${f.id}/share`, { json: { targetWorkspaceId: other.id } });
  expect(shared.status).toBe(201);
  expect(shared.json.clearedConnections).toBe(1);
  expect(shared.json.flow.workspaceSlug).toBe(other.slug);
  const copy = (await owner.http.get(`/api/flows/${shared.json.flow.id}`)).json;
  expect(copy.flow.name).toBe(`${f.name} (shared copy)`);
  expect(copy.flow.workspaceId).toBe(other.id);
  expect(copy.flow.graph.nodes.find((n: Json) => n.id === "send").data.config.connectionId).toBe("");
  expect(JSON.stringify(copy.flow.graph)).not.toContain(ghostConnection);
  expect((await stranger.http.post(`/api/flows/${f.id}/share`, { json: { targetWorkspaceId: other.id } })).status).toBe(404);
  expect((await owner.http.post(`/api/flows/${f.id}/share`, { json: { targetWorkspaceId: stranger.a.workspaceId } })).status).toBe(404);
  expect((await owner.http.post(`/api/flows/${f.id}/share`, { json: { targetWorkspaceId: "nope" } })).status).toBe(400);
  const viewer = await addMember(owner, "flows-share-viewer", "viewer");
  expect((await viewer.http.post(`/api/flows/${f.id}/share`, { json: { targetWorkspaceId: viewer.a.workspaceId } })).status).toBe(403);
});

// ── fl-flow-publish ──────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-flow-publish.1] publishing pins an immutable version; republishing adds a new one; unpublishing switches the triggers off", { tags: ["feat:fl-flow-publish", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-publish");
  const f = await newFlow(http, a.workspaceId, `Publish ${seeded("flow-publish", 4)}`, chain({ n: 1 }, "$"));
  expect((await http.get(`/api/flows/${f.id}/publish`)).json).toMatchObject({ publishedVersionId: null, webhook: null, schedule: null });
  const p1 = await http.post(`/api/flows/${f.id}/publish`);
  expect(p1.status).toBe(201);
  expect(p1.json).toMatchObject({ trigger: "trigger.manual", webhook: null, schedule: null });
  const v1 = p1.json.version as number;
  const info = (await http.get(`/api/flows/${f.id}/publish`)).json;
  expect(info.publishedVersionId).toBe(p1.json.versionId);
  const row = ((await http.get(`/api/workspaces/${a.workspaceId}/flows`)).json.flows as Json[]).find((x) => x.id === f.id);
  expect(row.publishedVersion).toBe(v1);
  const p2 = await http.post(`/api/flows/${f.id}/publish`);
  expect(p2.json.version).toBe(v1 + 1);
  const versions = (await http.get(`/api/flows/${f.id}/versions`)).json.versions as { id: string; reason: string }[];
  expect(versions.filter((v) => v.reason === "publish").length).toBe(2);
  const first = (await http.get(`/api/flows/${f.id}/versions/${p1.json.versionId}`)).json.version;
  expect(first.graph).toEqual(f.graph);
  expect((await http.del(`/api/flows/${f.id}/publish`)).json).toEqual({ ok: true });
  expect((await http.get(`/api/flows/${f.id}/publish`)).json.publishedVersionId).toBeNull();
  const log = (await http.get(`/api/workspaces/${a.workspaceId}/audit`)).json.events as { action: string; targetId: string }[];
  expect(log.some((e) => e.action === "flow.published" && e.targetId === f.id)).toBe(true);
});

// ── fl-templates (api level) ─────────────────────────────────────────────────────────────────────────────────────────
test("[fl-templates.2] every ready-to-run template creates a valid flow, and the connected-app templates say what is missing", { tags: ["feat:fl-templates", "shard:flows-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("flows-templates");
  const ready = ["lead-qualifier", "ticket-priority", "order-totals", "low-stock-list", "invoice-follow-up-list", "quote-calculator", "order-packing-list", "expense-category-summary", "subscription-review", "weekly-task-plan", "event-attendee-summary", "registration-check", "contact-list-cleanup", "support-backlog-summary", "survey-score-summary"];
  for (const templateId of ready) {
    const f = await createFlow(http, a.workspaceId, { templateId });
    const issues = (await http.get(`/api/flows/${f.id}`)).json.issues;
    expect(issues, templateId).toEqual([]);
    expect(f.graph.nodes.length).toBeGreaterThan(2);
  }
  const lead = await createFlow(http, a.workspaceId, { templateId: "lead-qualifier" });
  expect(lead.name).toBe("Lead Qualifier");
  const run = await startRun(http, lead.id);
  expect(run.status).toBe(202);
  const done = await waitRun(http, run.json.run.id);
  expect(done.status).toBe("succeeded");
  expect(done.output).toEqual({ hot_lead: { name: "Ada Lovelace", domain: "analytical.io", tier: "hot" } });
  for (const templateId of ["lead-enrichment", "support-triage", "invoice-extractor", "price-watch", "kpi-digest", "pr-review-router"]) {
    const f = await createFlow(http, a.workspaceId, { templateId });
    const issues = (await http.get(`/api/flows/${f.id}`)).json.issues as { code: string }[];
    expect(codes(issues), templateId).toContain("SETUP_REQUIRED");
    expect((await startRun(http, f.id)).status, `${templateId} run`).toBe(422);
  }
});

// ── fl-i18n-rtl (api level) ──────────────────────────────────────────────────────────────────────────────────────────
test("[fl-i18n-rtl.3] the language cookie decides the page language and direction, the template content language, and falls back to Arabic when invalid", { tags: ["feat:fl-i18n-rtl", "shard:flows-api", "lvl:api"] }, async () => {
  const dir = async (cookie: string | null) => {
    const h = new Http(undefined, cookie === null ? {} : { fl_locale: cookie });
    const html = (await h.get("/")).text;
    return { dir: /<html[^>]*\sdir="(\w+)"/.exec(html)?.[1], lang: /<html[^>]*\slang="([\w-]+)"/.exec(html)?.[1] };
  };
  expect(await dir(null)).toEqual({ dir: "rtl", lang: "ar" });
  expect(await dir("en")).toEqual({ dir: "ltr", lang: "en" });
  expect(await dir("ar")).toEqual({ dir: "rtl", lang: "ar" });
  expect(await dir("fr")).toEqual({ dir: "rtl", lang: "ar" });
  const { a } = await actor("flows-i18n");
  const arabic = clientOf(a);
  arabic.fixed.fl_locale = "ar";
  const f = await createFlow(arabic, a.workspaceId, { templateId: "lead-qualifier" });
  expect(f.name).not.toBe("Lead Qualifier");
  expect(f.name).toMatch(/[؀-ۿ]/);
});
