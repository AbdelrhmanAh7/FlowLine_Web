import { randomBytes, randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { FlowGraph, NodeType } from "@/engine/types";
import { getNodeDefinition } from "@/engine/nodes";
import { contextId, encryptSecretV2, openSecret } from "@/server/crypto";
import { getRunDetail } from "@/server/runs";
import { GET } from "@/app/api/v1/runs/[rid]/route";
import { processRun } from "../../worker/runner";

const mocks = vi.hoisted(() => ({ db: { select: vi.fn(), update: vi.fn() }, pause: false, echoCalls: 0, events: vi.fn(), marker: "synthetic-ordinary-runtime-credential" }));
vi.mock("@/db", async () => ({ db: mocks.db, schema: await import("@/db/schema") }));
vi.mock("@/server/flows", () => ({ insertVersion: vi.fn() }));
vi.mock("@/server/entitlements", () => ({ planEntitlements: vi.fn() }));
vi.mock("@/server/faults", () => ({ consumeFault: vi.fn() }));
vi.mock("@/server/events", () => ({ logEvent: mocks.events }));
vi.mock("@/server/apikeys", () => ({ authenticateApiKey: async () => ({ workspaceId: "workspace" }), requireScope: vi.fn() }));
vi.mock("@/server/access", () => ({ isUuid: () => true }));
vi.mock("@/engine/sandbox", async () => ({ evaluateIsolated: (await import("@/engine/expression")).evaluateExpression }));
vi.mock("../../worker/handlers", () => ({ createHandler: (ctx: { secrets: string[] }) => async (node: { id: string }, input: unknown, env: { log: (message: string) => void }) => {
  if (node.id === "echo") {
    mocks.echoCalls++;
    ctx.secrets.push(mocks.marker);
    env.log(`provider echo ${mocks.marker}`);
    return { kind: "ok", output: { nested: { note: `provider echo ${mocks.marker}`, safe: "retained" } } };
  }
  if (mocks.pause) return { kind: "pause", status: "waiting_approval", message: "Synthetic approval" };
  return { kind: "ok", output: input };
} }));

type Row = Record<string, unknown>;
const params = (condition: SQL) => new PgDialect().sqlToQuery(condition).params;
const graph: FlowGraph = {
  nodes: ([['trigger', 'trigger.manual'], ['echo', 'http.request'], ['wait', 'http.request'], ['out', 'output']] as [string, NodeType][]).map(([id, type]) => ({
    id, type, position: { x: 0, y: 0 }, data: { label: id, config: type === "output" ? { key: "result", expression: "" } : getNodeDefinition(type)!.defaultConfig() },
  })),
  edges: [["trigger", "echo"], ["echo", "wait"], ["wait", "out"]].map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
};

function fixture() {
  const runs = new Map<string, Row>();
  const steps: Row[] = [];
  const createRun = (extra: Row = {}) => {
    const row = { id: randomUUID(), workspaceId: "workspace", flowId: "flow", flowVersionId: "version", status: "running", lockedBy: "worker", input: {}, policy: null, ...extra };
    runs.set(row.id, row);
    for (const n of graph.nodes) steps.push({ runId: row.id, nodeId: n.id, nodeLabel: n.id, nodeType: n.type, status: "pending", output: null, input: null, dataEnc: null, dataLegacy: false });
    return row;
  };
  mocks.db.select.mockImplementation(() => {
    let table: unknown;
    let condition: SQL;
    let joined = false;
    const rows = () => {
      const id = String(params(condition)[0]);
      if (table === schema.run) return joined ? [{ run: runs.get(id), flowName: "Synthetic flow" }] : [runs.get(id)];
      if (table === schema.runStep) return steps.filter((s) => s.runId === id);
      if (table === schema.flowVersion) return [{ graph, version: 1, reason: "test" }];
      if (table === schema.workspace) return [{ id: "workspace" }];
      return [];
    };
    const query = {
      from: (t: unknown) => { table = t; return query; },
      innerJoin: () => { joined = true; return query; },
      where: (c: SQL) => { condition = c; return query; },
      orderBy: () => query, limit: () => query,
      then: (resolve: (value: unknown) => void) => resolve(rows()),
    };
    return query;
  });
  mocks.db.update.mockImplementation((table: unknown) => ({ set: (values: Row) => ({ where: (condition: SQL) => {
    const p = params(condition);
    const row = table === schema.run ? runs.get(String(p[0])) : steps.find((s) => s.runId === p[0] && s.nodeId === p[1]);
    // SQL increments are evaluated by Postgres; public rows contain numbers, never SQL ASTs.
    const stored = values.attempts ? { ...values, attempts: Number(row?.attempts ?? 0) + 1 } : values;
    const changed = row ? (Object.assign(row, stored), [{ id: "updated" }]) : [];
    return { returning: async () => changed, then: (resolve: (value: unknown) => void) => resolve(changed) };
  } }) }));
  return { createRun, steps, db: mocks.db as unknown as Db };
}

beforeEach(() => {
  vi.stubEnv("FLOWLINE_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("FLOWLINE_ENCRYPTION_KEYS_OLD", "");
  vi.stubEnv("FLOWLINE_TELEMETRY", "off");
  mocks.pause = false; mocks.echoCalls = 0; mocks.events.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function rawStep(row: Row) {
  const enc = row.dataEnc as { ciphertext: string; keyId: string };
  return openSecret<{ input: unknown; output: unknown; secrets: string[] }>({ ...enc, legacy: false }, {
    table: "run_step", rowId: `${row.runId}.${contextId(String(row.nodeId))}`, workspaceId: "workspace", provider: "engine", purpose: "step_data",
  });
}

async function assertPublic(run: Row) {
  expect(run.status).toBe("succeeded");
  expect(JSON.stringify(run.output)).not.toContain(mocks.marker);
  expect(JSON.stringify(run.output)).toContain("[REDACTED]");
  expect(JSON.stringify(run.output)).toContain("retained");
  const detail = await getRunDetail(String(run.id));
  expect(JSON.stringify(detail)).not.toContain(mocks.marker);
  expect(JSON.stringify(detail)).not.toContain("dataEnc");
  const response = await GET(new Request(`https://flowline.example/api/v1/runs/${run.id}`), { params: Promise.resolve({ rid: String(run.id) }) });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain(mocks.marker);
  expect(JSON.stringify(mocks.events.mock.calls)).not.toContain(mocks.marker);
}

describe("aggregate output is public; raw resume values stay encrypted", () => {
  it("redacts an integration echo before persistence and ordinary/v1 projection", async () => {
    const f = fixture(); const run = f.createRun();
    await processRun(f.db, run.id, "worker");
    await assertPublic(run);
    const echo = f.steps.find((s) => s.nodeId === "echo")!;
    expect(JSON.stringify(echo.output)).not.toContain(mocks.marker);
    expect(JSON.stringify(echo.log)).not.toContain(mocks.marker);
    expect(JSON.stringify(echo.dataEnc)).not.toContain(mocks.marker);
    expect(JSON.stringify(rawStep(echo).output)).toContain(mocks.marker);
    expect(rawStep(echo).secrets).toContain(mocks.marker);
  });

  it("restores the secret set on approval resume without re-running the credential-bearing step", async () => {
    const f = fixture(); const run = f.createRun(); mocks.pause = true;
    await processRun(f.db, run.id, "worker");
    expect(run.status).toBe("waiting_approval");
    Object.assign(run, { status: "running", lockedBy: "worker" });
    f.steps.find((s) => s.nodeId === "wait")!.status = "pending";
    mocks.pause = false;
    await processRun(f.db, run.id, "worker");
    expect(mocks.echoCalls).toBe(1);
    await assertPublic(run);
    expect(JSON.stringify(rawStep(f.steps.find((s) => s.nodeId === "out")!).output)).toContain(mocks.marker);
  });

  it("restores the secret set for reused rerun outputs without reading credentials again", async () => {
    const f = fixture(); const original = f.createRun();
    await processRun(f.db, original.id, "worker");
    const rerun = f.createRun({ rerunOfRunId: original.id, rerunFromNodeId: "wait" });
    await processRun(f.db, rerun.id, "worker");
    expect(mocks.echoCalls).toBe(1);
    await assertPublic(rerun);
    expect(JSON.stringify(rawStep(f.steps.find((s) => s.runId === rerun.id && s.nodeId === "out")!).output)).toContain(mocks.marker);
  });

  it("uses the public copy of legacy resume data that has no encrypted secret snapshot", async () => {
    const f = fixture(); const run = f.createRun();
    const echo = f.steps.find((s) => s.nodeId === "echo")!;
    Object.assign(echo, { status: "succeeded", output: { nested: { note: "[REDACTED]", safe: "retained" } }, dataEnc: encryptSecretV2({ input: {}, output: { nested: { note: mocks.marker, safe: "retained" } } }, {
      table: "run_step", rowId: `${run.id}.${contextId("echo")}`, workspaceId: "workspace", provider: "engine", purpose: "step_data",
    }) });
    await processRun(f.db, run.id, "worker");
    expect(mocks.echoCalls).toBe(0);
    await assertPublic(run);
  });
});
