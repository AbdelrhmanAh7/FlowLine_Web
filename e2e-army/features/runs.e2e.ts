// RUNS shard (jobs, no model): the execution worker end to end — a queued run is claimed, every step is recorded, branches are skipped, failures
// stop the downstream steps, the data nodes transform real values, finished runs can be listed, previewed, re-run and cancelled, and the monthly
// execution limit and usage ledger follow the runs. All through the HTTP API, observing what the worker wrote.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { seeded } from "../lib.ts";
import { Http, N, E, actor, anonymous, chain, connect, createFlow, fakeOrigin, newFlow, startRun, waitRun, type Graph, type Json } from "./_helpers.ts";

const finish = async (http: Http, flowId: string, input?: unknown) => {
  const started = await startRun(http, flowId, input);
  if (started.status !== 202) throw new Error(`run not accepted: ${started.status} ${started.text.slice(0, 300)}`);
  return waitRun(http, started.json.run.id);
};
const stepOf = (run: Json, id: string) => run.steps.find((s: Json) => s.nodeId === id);

// ── fl-run-execution ─────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-run-execution.1] a queued run is executed by the worker: steps in order, the untaken branch skipped, the result saved", { tags: ["feat:fl-run-execution", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-exec");
  const f = await createFlow(http, a.workspaceId, { templateId: "lead-qualifier" });
  const started = await startRun(http, f.id);
  expect(started.status).toBe(202);
  expect(started.json.duplicate).toBe(false);
  expect(started.json.run).toMatchObject({ status: "queued", triggerKind: "manual", flowId: f.id });
  expect(started.json.run.number).toBeGreaterThan(0);
  const run = await waitRun(http, started.json.run.id);
  expect(run.status).toBe("succeeded");
  expect(run.output).toEqual({ hot_lead: { name: "Ada Lovelace", domain: "analytical.io", tier: "hot" } });
  expect(run.steps.map((s: Json) => [s.nodeId, s.status])).toEqual([["trigger", "succeeded"], ["normalise", "succeeded"], ["is-hot", "succeeded"], ["hot", "succeeded"], ["nurture", "skipped"]]);
  expect(stepOf(run, "normalise").output).toEqual({ name: "Ada Lovelace", domain: "analytical.io", size: 120 });
  expect(stepOf(run, "nurture").skipReason).toMatch(/took the true branch/);
  expect(run.finishedAt).not.toBeNull();
  expect(run.durationMs).toBeGreaterThanOrEqual(0);
  expect(run.graph.nodes).toHaveLength(5);
  expect(run.events[0].type).toBe("queued");
  const listed = (await http.get(`/api/flows/${f.id}/runs`)).json.runs as { id: string }[];
  expect(listed.map((r) => r.id)).toContain(started.json.run.id);
});

test("[fl-run-execution.2] a run takes the caller's input, and a failing step fails the run and skips what depends on it", { tags: ["feat:fl-run-execution", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-exec-2");
  const f = await createFlow(http, a.workspaceId, { templateId: "lead-qualifier" });
  const small = await finish(http, f.id, { lead: { name: "Grace Hopper", email: "grace@navy.mil", employees: 3 } });
  expect(small.status).toBe("succeeded");
  expect(small.output).toEqual({ nurture: { name: "Grace Hopper", tier: "nurture" } });
  expect(stepOf(small, "hot").status).toBe("skipped");
  expect(small.input.lead.employees).toBe(3);
  const broken = await newFlow(http, a.workspaceId, `Broken ${seeded("runs-broken", 4)}`, chain({ v: "abc" }, '$number("abc")'));
  const failed = await finish(http, broken.id);
  expect(failed.status).toBe("failed");
  expect(stepOf(failed, "shape")).toMatchObject({ status: "failed", error: { code: "EXPRESSION_RUNTIME" } });
  expect(stepOf(failed, "out").status).toBe("skipped");
  expect(stepOf(failed, "out").skipReason).toMatch(/failed/);
  expect(failed.error).toMatchObject({ code: "EXPRESSION_RUNTIME", nodeId: "shape" });
  expect(failed.output).toEqual({});
});

test("[fl-run-execution.3] a double-clicked Run returns the same run, and malformed or oversized run requests are refused", { tags: ["feat:fl-run-execution", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-exec-3");
  const f = await newFlow(http, a.workspaceId, `Click ${seeded("runs-click", 4)}`, chain({ n: 1 }, "$"));
  const click = seeded("click", 12);
  const first = await startRun(http, f.id, undefined, click);
  const second = await startRun(http, f.id, undefined, click);
  expect(first.status).toBe(202);
  expect(second.status).toBe(200);
  expect(second.json.duplicate).toBe(true);
  expect(second.json.run.id).toBe(first.json.run.id);
  await waitRun(http, first.json.run.id);
  expect((await startRun(http, f.id, undefined, "short")).status).toBe(400);
  const big = await startRun(http, f.id, { blob: "x".repeat(300 * 1024) });
  expect(big.status).toBe(413);
  expect(big.json.error.code).toBe("INPUT_TOO_LARGE");
  const bad = await http.post(`/api/flows/${f.id}/runs`, { body: "{nope", headers: { "content-type": "application/json" } });
  expect(bad.status).toBe(400);
  expect(bad.json.error.code).toBe("BAD_JSON");
  expect((await anonymous().post(`/api/flows/${f.id}/runs`, { json: {} })).status).toBe(401);
});

// ── fl-engine-nodes ──────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-engine-nodes.1] filter, map and merge nodes reshape lists and join branches", { tags: ["feat:fl-engine-nodes", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-nodes-1");
  const payload = { items: [{ n: "a", qty: 1 }, { n: "b", qty: 5 }, { n: "c", qty: 9 }] };
  const g: Graph = {
    nodes: [N.manual(payload), N.filter("big", "qty > 2", "items"), N.map("stats", [{ key: "count", expression: "$count($)" }, { key: "total", expression: "$sum($.qty)" }]),
      N.transform("names", "{ \"names\": items.n }"), N.merge("both", "object"), N.output("o1", "merged", "", 900, "o1", 40), N.output("o2", "filtered", "", 900, "o2", 220)],
    edges: [E("t", "big"), E("big", "stats"), E("big", "o2"), E("t", "names"), E("stats", "both"), E("names", "both"), E("both", "o1")],
  };
  const f = await newFlow(http, a.workspaceId, `Data nodes ${seeded("runs-nodes-1", 4)}`, g);
  expect((await http.get(`/api/flows/${f.id}`)).json.issues).toEqual([]);
  const run = await finish(http, f.id);
  expect(run.status).toBe("succeeded");
  expect(run.output.filtered).toEqual([{ n: "b", qty: 5 }, { n: "c", qty: 9 }]);
  expect(run.output.merged).toEqual({ stats: { count: 2, total: 14 }, names: { names: ["a", "b", "c"] } });
  const arr: Graph = {
    nodes: [N.manual({}), N.transform("A", '{ "a": 1 }'), N.transform("B", '{ "b": 2 }'), N.merge("both", "array"), N.output("o", "list")],
    edges: [E("t", "A"), E("t", "B"), E("A", "both"), E("B", "both"), E("both", "o")],
  };
  const f2 = await newFlow(http, a.workspaceId, `Merge array ${seeded("runs-nodes-1b", 4)}`, arr);
  expect((await finish(http, f2.id)).output).toEqual({ list: [{ a: 1 }, { b: 2 }] });
});

test("[fl-engine-nodes.2] the workspace store keeps values between runs and reports a missing key", { tags: ["feat:fl-engine-nodes", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-nodes-2");
  const key = seeded("store-key", 8);
  const setter = await newFlow(http, a.workspaceId, `Store set ${seeded("runs-store-s", 4)}`, {
    nodes: [N.manual({ who: "ada" }), N.store("save", "set", "army", `"${key}"`, '{ "who": who, "n": 7 }'), N.output("o", "saved")], edges: [E("t", "save"), E("save", "o")],
  });
  expect((await finish(http, setter.id)).output.saved).toEqual({ key, stored: true, value: { who: "ada", n: 7 } });
  const getter = await newFlow(http, a.workspaceId, `Store get ${seeded("runs-store-g", 4)}`, {
    nodes: [N.manual({}), N.store("load", "get", "army", `"${key}"`), N.store("missing", "get", "army", `"${key}-absent"`), N.output("o", "loaded"), N.output("o2", "absent", "", 900, "o2", 220)], edges: [E("t", "load"), E("t", "missing"), E("load", "o"), E("missing", "o2")],
  });
  const got = await finish(http, getter.id);
  expect(got.output.loaded).toMatchObject({ key, found: true, value: { who: "ada", n: 7 } });
  expect(got.output.absent).toMatchObject({ found: false, value: null });
});

test("[fl-engine-nodes.3] a published flow can be called as a subflow, and a loop runs it once per item within its limit", { tags: ["feat:fl-engine-nodes", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-nodes-3");
  const child = await newFlow(http, a.workspaceId, `Child ${seeded("runs-child", 4)}`, { nodes: [N.manual({ n: 1 }), N.transform("calc", "{ \"double\": n * 2 }"), N.output("o", "res")], edges: [E("t", "calc"), E("calc", "o")] });
  const published = await http.post(`/api/flows/${child.id}/publish`);
  expect(published.status).toBe(201);
  const v = published.json.version as number;
  const parent = await newFlow(http, a.workspaceId, `Parent ${seeded("runs-parent", 4)}`, { nodes: [N.manual({ n: 21 }), N.subflow("call", child.id, v), N.output("o", "answer")], edges: [E("t", "call"), E("call", "o")] });
  expect((await http.get(`/api/flows/${parent.id}`)).json.issues).toEqual([]);
  expect((await finish(http, parent.id)).output).toEqual({ answer: { res: { double: 42 } } });
  const loopFlow = await newFlow(http, a.workspaceId, `Loop ${seeded("runs-loop", 4)}`, { nodes: [N.manual({ xs: [1, 2, 3] }), N.loop("each", "xs", child.id, v, 5), N.output("o", "all")], edges: [E("t", "each"), E("each", "o")] });
  const looped = await finish(http, loopFlow.id, { xs: [{ n: 1 }, { n: 2 }, { n: 3 }] });
  expect(looped.output.all).toEqual({ items: [{ res: { double: 2 } }, { res: { double: 4 } }, { res: { double: 6 } }], count: 3 });
  const tooMany = await newFlow(http, a.workspaceId, `Loop limit ${seeded("runs-loop-2", 4)}`, { nodes: [N.manual({}), N.loop("each", "xs", child.id, v, 2), N.output("o", "all")], edges: [E("t", "each"), E("each", "o")] });
  const refused = await finish(http, tooMany.id, { xs: [{ n: 1 }, { n: 2 }, { n: 3 }] });
  expect(refused.status).toBe("failed");
  expect(stepOf(refused, "each").error.code).toBe("LOOP_LIMIT");
  const draftOnly = await newFlow(http, a.workspaceId, `Draft only ${seeded("runs-child-draft", 4)}`, chain({ n: 1 }, "$"));
  const unpublished = await newFlow(http, a.workspaceId, `Uses draft ${seeded("runs-uses-draft", 4)}`, { nodes: [N.manual({}), N.subflow("call", draftOnly.id, 1), N.output("o", "x")], edges: [E("t", "call"), E("call", "o")] });
  const pub = await http.post(`/api/flows/${unpublished.id}/publish`);
  expect(pub.status).toBe(422);
  expect(JSON.stringify(pub.json.error.details)).toMatch(/SUBFLOW_NOT_FOUND|SUBFLOW_NOT_PUBLISHED/);
});

test("[fl-engine-nodes.4] the HTTP node refuses private and metadata addresses, and a code step runs only inside the isolated sandbox", { tags: ["feat:fl-engine-nodes", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-nodes-4");
  for (const url of ["http://127.0.0.1:9/never", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/internal"]) {
    const f = await newFlow(http, a.workspaceId, `Egress ${seeded(url, 4)}`, { nodes: [N.manual({}), N.http("call", "GET", `"${url}"`), N.output("o", "r")], edges: [E("t", "call"), E("call", "o")] });
    const run = await finish(http, f.id);
    expect(run.status, url).toBe("failed");
    expect(stepOf(run, "call").error.code, url).toBe("EGRESS_BLOCKED");
  }
  const catalog = (await http.get("/api/integrations/catalog")).json;
  const sandbox = catalog.runtime.codeSandbox as { available: boolean };
  const code = await newFlow(http, a.workspaceId, `Code ${seeded("runs-code", 4)}`, { nodes: [N.manual({ n: 20 }), N.code("calc", "return { doubled: input.n * 2 };"), N.output("o", "r")], edges: [E("t", "calc"), E("calc", "o")] });
  const run = await finish(http, code.id);
  if (sandbox.available) {
    expect(run.status).toBe("succeeded");
    expect(run.output).toEqual({ r: { doubled: 40 } });
  } else {
    // No Docker on this machine: the product must refuse to run user code anywhere else.
    expect(run.status).toBe("failed");
    expect(stepOf(run, "calc").error.code).toBe("SANDBOX_UNAVAILABLE");
  }
});

// ── fl-csv-data-node ─────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-csv-data-node.1] the CSV node parses text into rows with their column names", { tags: ["feat:fl-csv-data-node", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-csv");
  const parse = await newFlow(http, a.workspaceId, `CSV parse ${seeded("runs-csv-p", 4)}`, {
    nodes: [N.manual({ text: "name,qty\nA,1\nB,2" }), N.csv("rows", "parse", "text"), N.output("o", "table")], edges: [E("t", "rows"), E("rows", "o")],
  });
  expect((await finish(http, parse.id)).output).toEqual({ table: { rows: [{ name: "A", qty: "1" }, { name: "B", qty: "2" }], rowCount: 2, fields: ["name", "qty"] } });
  const semi = await newFlow(http, a.workspaceId, `CSV semicolon ${seeded("runs-csv-s", 4)}`, {
    nodes: [N.manual({ text: "a;b\n1;2" }), N.csv("rows", "parse", "text", ";"), N.output("o", "table")], edges: [E("t", "rows"), E("rows", "o")],
  });
  expect((await finish(http, semi.id)).output.table).toMatchObject({ rows: [{ a: "1", b: "2" }], fields: ["a", "b"] });
  const notText = await newFlow(http, a.workspaceId, `CSV not text ${seeded("runs-csv-n", 4)}`, { nodes: [N.manual({ text: 5 }), N.csv("rows", "parse", "text"), N.output("o", "table")], edges: [E("t", "rows"), E("rows", "o")] });
  const failed = await finish(http, notText.id);
  expect(failed.status).toBe("failed");
  expect(stepOf(failed, "rows").error.code).toBe("INVALID_INPUT");
});

test("[fl-csv-data-node.2] the CSV node builds a file from rows made inside the flow, in the order of their columns", { tags: ["feat:fl-csv-data-node", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-csv-2");
  const f = await newFlow(http, a.workspaceId, `CSV build ${seeded("csv-build-a", 4)}`, { nodes: [N.manual({}), N.transform("rows", '[{ "name": "A", "qty": 1 }, { "name": "B", "qty": 2 }]'), N.csv("text", "build"), N.output("o", "file")], edges: [E("t", "rows"), E("rows", "text"), E("text", "o")] });
  expect(((await finish(http, f.id)).output.file.csv as string).replace(/\r\n/g, "\n")).toBe("name,qty\nA,1\nB,2");
});

test("[fl-csv-data-node.3] the CSV node keeps the column order of rows that arrive with the run (e.g. a webhook body)", { tags: ["feat:fl-csv-data-node", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-csv-3");
  const f = await newFlow(http, a.workspaceId, `CSV build input ${seeded("csv-build-b", 4)}`, { nodes: [N.manual({ rows: [{ name: "A", qty: 1 }, { name: "B", qty: 2 }] }), N.csv("text", "build", "rows"), N.output("o", "file")], edges: [E("t", "text"), E("text", "o")] });
  expect(((await finish(http, f.id)).output.file.csv as string).replace(/\r\n/g, "\n")).toBe("name,qty\nA,1\nB,2");
});

// ── fl-files ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-files.1] an uploaded file is stored per workspace, type- and size-checked, and a flow can read it", { tags: ["feat:fl-files", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-files");
  const other = await actor("runs-files-other");
  const upload = (wid: string, who: Http, name: string, type: string, content: BlobPart) => {
    const fd = new FormData();
    fd.append("file", new Blob([content], { type }), name);
    return who.post(`/api/workspaces/${wid}/files`, { body: fd });
  };
  const csvName = `orders-${seeded("file-csv", 4)}.csv`;
  const ok = await upload(a.workspaceId, http, csvName, "text/csv", "sku,qty\nA-1,3\nB-7,1\n");
  expect(ok.status).toBe(201);
  expect(ok.json.file).toMatchObject({ name: csvName, mime: "text/csv" });
  const listed = (await http.get(`/api/workspaces/${a.workspaceId}/files`)).json.files as { id: string; name: string }[];
  expect(listed.some((f) => f.name === csvName)).toBe(true);
  expect((await upload(a.workspaceId, http, "evil.exe", "application/x-msdownload", "MZ")).status).toBe(415);
  expect((await upload(a.workspaceId, http, "fake.pdf", "application/pdf", "not a pdf")).status).toBe(415);
  expect((await http.post(`/api/workspaces/${a.workspaceId}/files`, { json: { x: 1 } })).status).toBe(400);
  expect((await upload(other.a.workspaceId, http, "x.csv", "text/csv", "a\n1")).status).toBe(404);
  expect((await other.http.get(`/api/workspaces/${a.workspaceId}/files`)).status).toBe(404);
  const f = await newFlow(http, a.workspaceId, `Read file ${seeded("runs-file-flow", 4)}`, { nodes: [N.manual({}), N.file("read", "upload", ok.json.file.id, "csv"), N.output("o", "table")], edges: [E("t", "read"), E("read", "o")] });
  const run = await finish(http, f.id);
  expect(run.status).toBe("succeeded");
  expect(run.output.table.rows ?? run.output.table).toBeTruthy();
  expect(JSON.stringify(run.output.table)).toContain("A-1");
  const foreign = await newFlow(other.http, other.a.workspaceId, `Foreign file ${seeded("runs-file-foreign", 4)}`, { nodes: [N.manual({}), N.file("read", "upload", ok.json.file.id, "csv"), N.output("o", "table")], edges: [E("t", "read"), E("read", "o")] });
  const blocked = await finish(other.http, foreign.id);
  expect(blocked.status).toBe("failed");
  expect(stepOf(blocked, "read").error.code).toBe("FILE_NOT_FOUND");
});

// ── fl-run-history (api level) ───────────────────────────────────────────────────────────────────────────────────────
test("[fl-run-history.2] the run list filters by status, flow and text, pages with a cursor, and run details never carry internals", { tags: ["feat:fl-run-history", "shard:runs", "lvl:api"] }, async () => {
  const { a, http } = await actor("runs-history");
  const ws = (await http.post("/api/workspaces", { json: { name: `History ${seeded("runs-hist-ws", 4)}` } })).json.workspace;
  const ok = await newFlow(http, ws.id, `History OK ${seeded("hist-ok", 4)}`, chain({ n: 1 }, "$"));
  const bad = await newFlow(http, ws.id, `History BAD ${seeded("hist-bad", 4)}`, chain({ n: 1 }, '$number("x")'));
  const okRuns = [];
  for (let i = 0; i < 3; i++) okRuns.push((await finish(http, ok.id)));
  const badRun = await finish(http, bad.id);
  const list = async (query = "") => (await http.get(`/api/workspaces/${ws.id}/runs${query}`)).json;
  const all = await list();
  expect(all.runs).toHaveLength(4);
  expect(all.runs[0].id).toBe(badRun.id);
  expect(all.runs.map((r: Json) => r.number)).toEqual([...all.runs.map((r: Json) => r.number)].sort((x: number, y: number) => y - x));
  expect((await list("?status=failed")).runs.map((r: Json) => r.id)).toEqual([badRun.id]);
  expect((await list("?status=succeeded")).runs).toHaveLength(3);
  expect((await list(`?flowId=${ok.id}`)).runs).toHaveLength(3);
  expect((await list(`?q=${encodeURIComponent("history bad")}`)).runs.map((r: Json) => r.id)).toEqual([badRun.id]);
  expect((await list(`?q=%23${okRuns[0].number}`)).runs.map((r: Json) => r.id)).toContain(okRuns[0].id);
  const page1 = await list("?limit=2");
  expect(page1.runs).toHaveLength(2);
  expect(page1.nextCursor).not.toBeNull();
  const page2 = await list(`?limit=2&beforeAt=${encodeURIComponent(page1.nextCursor.createdAt)}&beforeId=${page1.nextCursor.id}`);
  expect(page2.runs).toHaveLength(2);
  expect(new Set([...page1.runs, ...page2.runs].map((r: Json) => r.id)).size).toBe(4);
  const detail = (await http.get(`/api/runs/${okRuns[0].id}`)).json.run;
  for (const internal of ["lockedBy", "attempts", "heartbeatAt", "policy"]) expect(detail, internal).not.toHaveProperty(internal);
  for (const step of detail.steps) expect(step).not.toHaveProperty("dataEnc");
  expect(a.workspaceId).not.toBe(ws.id);
});

// ── fl-run-control ───────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-run-control.1] a run held by a slow provider can be cancelled mid-request; finished or active runs refuse the wrong controls", { tags: ["feat:fl-run-control", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-control");
  const conn = await connect(http, a.workspaceId, "google_sheets", `Sheets ${seeded("ctl-sheet", 4)}`);
  const fake = await fakeOrigin(http, a.workspaceId);
  const sheetId = `sheet-${seeded("ctl-sheet-id", 8)}`;
  const f = await newFlow(http, a.workspaceId, `Slow sheet ${seeded("ctl-flow", 4)}`, {
    nodes: [N.manual({ name: "Ada" }), N.action("sheet", "google_sheets.append_row", conn.id, `{ "spreadsheetId": "${sheetId}", "range": "A1", "row": [name] }`), N.output("o", "done")],
    edges: [E("t", "sheet"), E("sheet", "o")],
  });
  const fault = await fetch(`${fake}/__fake/fault`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google_sheets", pathPattern: sheetId, mode: "delay", times: 1000, delayMs: 20000 }) });
  expect(fault.status).toBe(200);
  const started = await startRun(http, f.id);
  const rid = started.json.run.id as string;
  await expect.poll(async () => ((await http.get(`/api/runs/${rid}`)).json.run.steps as Json[]).find((s) => s.nodeId === "sheet")?.status, { timeout: 30_000, interval: 300 }).toBe("running");
  const early = await http.post(`/api/runs/${rid}/rerun`, { json: { fromNodeId: "sheet" } });
  expect(early.status).toBe(409);
  expect(early.json.error.code).toBe("RUN_ACTIVE");
  expect((await http.post(`/api/runs/${rid}/cancel`)).json.status).toBe("cancelling");
  const done = await waitRun(http, rid, ["cancelled", "failed"], 30_000);
  expect(done.status).toBe("cancelled");
  const again = await http.post(`/api/runs/${rid}/cancel`);
  expect(again.status).toBe(409);
  expect(again.json.error.code).toBe("RUN_FINISHED");
});

test("[fl-run-control.2] a re-run from a step previews what repeats, reuses the upstream results and can use the latest saved flow", { tags: ["feat:fl-run-control", "shard:runs", "lvl:job"] }, async () => {
  const { a, http } = await actor("runs-rerun");
  const g = (second: string): Graph => ({ nodes: [N.manual({ n: 2 }), N.transform("first", "{ \"n\": n + 1 }"), N.transform("second", second, 600), N.output("o", "result", "", 900)], edges: [E("t", "first"), E("first", "second"), E("second", "o")] });
  const f = await newFlow(http, a.workspaceId, `Rerun ${seeded("rerun-flow", 4)}`, g("{ \"v\": n * 10 }"));
  const run = await finish(http, f.id);
  expect(run.output).toEqual({ result: { v: 30 } });
  const preview = (await http.get(`/api/runs/${run.id}/rerun-preview?fromNodeId=second`)).json;
  expect(preview.willRerun.map((s: Json) => s.nodeId)).toEqual(["second", "o"]);
  expect(preview.reused.map((s: Json) => s.nodeId)).toEqual(["t", "first"]);
  expect(preview.warnings).toEqual([]);
  expect((await http.get(`/api/runs/${run.id}/rerun-preview?fromNodeId=ghost`)).status).toBe(422);
  const re = await http.post(`/api/runs/${run.id}/rerun`, { json: { fromNodeId: "second" } });
  expect(re.status).toBe(202);
  expect(re.json.run).toMatchObject({ triggerKind: "rerun", rerunOfRunId: run.id, rerunFromNodeId: "second" });
  const again = await waitRun(http, re.json.run.id);
  expect(again.status).toBe("succeeded");
  expect(again.steps.map((s: Json) => [s.nodeId, s.status])).toEqual([["t", "reused"], ["first", "reused"], ["second", "succeeded"], ["o", "succeeded"]]);
  expect(again.output).toEqual({ result: { v: 30 } });
  const saved = await http.get(`/api/flows/${f.id}`);
  await http.put(`/api/flows/${f.id}`, { json: { baseRevision: saved.json.flow.revision, graph: g("{ \"v\": n * 100 }") } });
  const latest = await http.post(`/api/runs/${run.id}/rerun`, { json: { fromNodeId: "second", revision: "latest" } });
  const latestRun = await waitRun(http, latest.json.run.id);
  expect(latestRun.output).toEqual({ result: { v: 300 } });
  expect(stepOf(latestRun, "first").status).toBe("reused");
  const original = await waitRun(http, (await http.post(`/api/runs/${run.id}/rerun`, { json: { fromNodeId: "second" } })).json.run.id);
  expect(original.output).toEqual({ result: { v: 30 } });
  expect((await http.post(`/api/runs/${run.id}/rerun`, { json: { fromNodeId: "second", revision: "tomorrow" } })).status).toBe(400);
});

// ── fl-usage-limits ──────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-usage-limits.1] every run is counted in the monthly usage ledger, and the monthly execution limit stops further runs", { tags: ["feat:fl-usage-limits", "shard:runs", "lvl:job"] }, async () => {
  const { http } = await actor("runs-limits");
  const ws = (await http.post("/api/workspaces", { json: { name: `Limits ${seeded("limits-ws", 4)}` } })).json.workspace;
  const f = await newFlow(http, ws.id, `Limited ${seeded("limits-flow", 4)}`, chain({ n: 1 }, "$"));
  expect((await http.patch(`/api/workspaces/${ws.id}`, { json: { maxMonthlyExecutions: 0 } })).status).toBe(400);
  expect((await http.patch(`/api/workspaces/${ws.id}`, { json: { maxMonthlyExecutions: 2 } })).status).toBe(200);
  await finish(http, f.id);
  await finish(http, f.id);
  const refused = await startRun(http, f.id);
  expect(refused.status).toBe(429);
  expect(refused.json.error.code).toBe("EXECUTION_LIMIT");
  const usage = (await http.get(`/api/workspaces/${ws.id}/usage`)).json;
  const exec = (usage.rows as Json[]).find((r) => r.kind === "execution");
  expect(exec.events).toBe(2);
  expect(usage.totalMicros).toBe(0);
  expect((await http.patch(`/api/workspaces/${ws.id}`, { json: { maxMonthlyExecutions: null } })).status).toBe(200);
  expect((await finish(http, f.id)).status).toBe("succeeded");
  expect(((await http.get(`/api/workspaces/${ws.id}/usage`)).json.rows as Json[]).find((r) => r.kind === "execution").events).toBe(3);
});
