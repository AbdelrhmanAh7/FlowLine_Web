import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { DESIGN_TEMPLATES } from "@/engine/design-templates";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph } from "@/engine/types";
import { z } from "zod";
import mizano from "@/integrations/providers/mizano";
import type { ActionDef } from "@/integrations/types";
import { decide } from "@/server/approvals";
import { createConnection } from "@/server/connections";
import { getAction } from "@/integrations/registry";
import { createFlow, saveFlow } from "@/server/flows";
import { serverIssues } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

/**
 * The "Deal won → Mizano quote" template through the REAL worker (claim, approval gate, decide, resume) with a
 * mocked Mizano. The real Mizano create actions (#147) are swapped for recorders that keep their schemas and return a full response;
 * everything between the run and the action (inputs, approval binding, rejection) is the production path.
 */
let fake: Fake;
const calls: { action: string; args: unknown }[] = [];
const realIdentity = mizano.identity;
/** Undo for each action we touched: restore the original action object we replaced. */
const restore: (() => void)[] = [];

/**
 * Register a recording action for `id`. If a real action exists (from #147), it is replaced entirely and restored
 * afterwards. If not, a stand-in is inserted and removed afterwards. This avoids duplicates and lookup-order issues
 * when #147 lands.
 */
function record(id: string, response: Record<string, unknown> | ((args: Record<string, any>) => Record<string, unknown>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rec = async (_ctx: unknown, args: Record<string, unknown>) => {
    calls.push({ action: id, args });
    // The real action's output schema still validates what a recorder returns, so give it a full, realistic response.
    return typeof response === "function" ? response(args) : response;
  };
  const idx = mizano.actions.findIndex((a) => a.id === id);
  if (idx !== -1) {
    // Real action exists (from #147): replace the whole object and restore it later.
    const original = mizano.actions[idx];
    const recordingAction: ActionDef = {
      ...original,
      run: rec as unknown as ActionDef["run"],
    };
    mizano.actions[idx] = recordingAction;
    restore.push(() => {
      mizano.actions[idx] = original;
    });
    return;
  }
  // No real action yet: insert a stand-in and remove it later.
  const stand: ActionDef = {
    id,
    version: 1,
    provider: "mizano",
    title: id,
    description: id,
    input: z.record(z.string(), z.unknown()),
    output: z.record(z.string(), z.unknown()),
    sideEffect: "non_idempotent",
    requiredScopes: [],
    run: rec,
  };
  mizano.actions.push(stand);
  restore.push(() => {
    const i = mizano.actions.findIndex((a) => a.id === id);
    if (i !== -1) mizano.actions.splice(i, 1);
  });
}

beforeAll(async () => {
  fake = await startFake();
  mizano.identity = async () => ({ accountId: "mz-test", label: "Mizano test" });
});
afterAll(async () => {
  while (restore.length) restore.pop()!();
  mizano.identity = realIdentity;
  stopSandbox();
  await fake.close();
  await closeDb();
});

async function startRun() {
  const tpl = DESIGN_TEMPLATES.find((t) => t.id === "deal-won-mizano-quote")!;
  const user = await makeUser("dwm");
  const ws = await createWorkspace(user, unique("DealWon"));
  const mz = await createConnection(db, user.id, ws.id, "mizano", "Mizano", { token: "test-key", baseUrl: "https://mizano.example.com" });
  const slack = await createConnection(db, user.id, ws.id, "slack", "Slack", { token: "test-token" });
  const graph = structuredClone(tpl.graph) as FlowGraph;
  for (const n of graph.nodes) {
    const cfg = n.data.config as unknown as Record<string, unknown>;
    if (n.type === "integration.action") cfg.connectionId = String(cfg.actionId).startsWith("mizano.") ? mz.id : slack.id;
    for (const [k, v] of Object.entries(cfg)) if (typeof v === "string") cfg[k] = v.replace(/REPLACE_WITH_CHANNEL_ID/g, "C_SALES");
  }
  const flow = await createFlow(user, ws.id, { name: unique("dwm") });
  await saveFlow(user, flow.id, { baseRevision: 1, graph });
  calls.length = 0;
  await fake.reset();
  const run = await enqueueRun(user, flow.id);
  await claimAndProcess(run.id);
  const [approval] = await db.select().from(schema.approval).where(eq(schema.approval.runId, run.id));
  return { user, ws, run, approval: approval! };
}

describe("Deal won → Mizano quote: availability", () => {
  it("is refused with TEMPLATE_UNAVAILABLE while an action it calls is not registered, and allowed once it is", async () => {
    const user = await makeUser("dwm-avail");
    const ws = await createWorkspace(user, unique("DealWonAvail"));
    const tpl = DESIGN_TEMPLATES.find((t) => t.id === "deal-won-mizano-quote")!;
    const graph = structuredClone(tpl.graph) as FlowGraph;
    const unknownNodes = async () => (await serverIssues(db, ws.id, graph)).filter((i) => i.code === "UNKNOWN_ACTION").map((i) => i.nodeId).sort();
    // Take both Mizano actions out of the registry for this part, whatever #147 registered, then put them back.
    const ids = ["mizano.create_customer", "mizano.create_draft_quote"];
    const removed = ids.flatMap((id) => {
      const i = mizano.actions.findIndex((a) => a.id === id);
      return i === -1 ? [] : mizano.actions.splice(i, 1);
    });
    try {
      expect(ids.some((id) => getAction(id))).toBe(false);
      await expect(createFlow(user, ws.id, { templateId: "deal-won-mizano-quote" })).rejects.toMatchObject({ status: 409, code: "TEMPLATE_UNAVAILABLE" });
      // The publish check (serverIssues) also refuses the graph while the actions are unregistered: both Mizano steps.
      expect(await unknownNodes()).toEqual(["customer", "quote"]);
    } finally {
      mizano.actions.push(...removed);
    }
    record("mizano.create_customer", (a) => ({ id: "cust-1", name: a.name, company: a.company, email: a.email, phone: a.phone }));
    record("mizano.create_draft_quote", (a) => ({ id: "Q-1", customerId: a.customerId, currency: a.currency, lines: a.lines }));
    // With the actions registered (as #147 will register them) nothing is unknown to the publisher any more.
    expect(await unknownNodes()).toEqual([]);
    const flow = await createFlow(user, ws.id, { templateId: "deal-won-mizano-quote" });
    expect(flow.templateId).toBe("deal-won-mizano-quote");
    while (restore.length) restore.pop()!(); // later tests register their own recorders
  });

  it("registers exactly one recorder per action id — replacing the real action, never duplicating it — and restores it", () => {
    const count = () => mizano.actions.filter((a) => a.id === "mizano.create_customer").length;
    const before = count();
    record("mizano.create_customer", { id: "c1" });
    expect(count()).toBe(1); // present from #147: replaced; absent: a single stand-in inserted
    record("mizano.create_customer", { id: "c2" }); // a second recorder for the same id replaces, never appends
    expect(count()).toBe(1);
    while (restore.length) restore.pop()!();
    expect(count()).toBe(before); // fully restored: #147's action (or nothing) is back
  });
});

describe("Deal won → Mizano quote: real worker approval path", () => {
  beforeAll(() => {
    record("mizano.create_customer", (a) => ({ id: "cust-1", name: a.name, company: a.company, email: a.email, phone: a.phone }));
    record("mizano.create_draft_quote", (a) => ({ id: "Q-1", customerId: a.customerId, currency: a.currency, lines: a.lines }));
  });

  it("waits for approval with nothing sent to Mizano, shows the customer, then runs once approved", async () => {
    const { user, ws, run, approval } = await startRun();
    expect((await freshRun(run.id)).status).toBe("waiting_approval");
    expect(calls).toEqual([]);
    expect(approval.argsPreview).toMatchObject({ name: "Mona Hassan", company: "Nile Bakery" });
    // The approval is bound to the customer only (CTO decision on #149, 2026-10-12): the quote lines are not part of
    // the preview. They live in the Prepare step output and are sent to Mizano with the draft quote below.
    expect(JSON.stringify(approval.argsPreview)).not.toContain("Oven service plan");

    await decide(db, { workspaceId: ws.id, approvalId: approval.id, userId: user.id, decision: "approve" });
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
    expect(calls.map((c) => c.action)).toEqual(["mizano.create_customer", "mizano.create_draft_quote"]);
    expect(calls[1]!.args).toMatchObject({ customerId: "cust-1", currency: "EGP" });
    expect((calls[1]!.args as { lines: unknown[] }).lines).toHaveLength(2);
    const slack = (await fake.requests("slack")).filter((r) => r.path.includes("postMessage"));
    expect(JSON.stringify(slack.map((r) => r.body))).toContain("Draft quote Q-1 created in Mizano for Nile Bakery (2 lines)");
  });

  it("rejecting ends the run: no call reaches Mizano, nothing is posted to Slack", async () => {
    const { user, ws, run, approval } = await startRun();
    await decide(db, { workspaceId: ws.id, approvalId: approval.id, userId: user.id, decision: "reject", note: "customer not confirmed" });
    await claimAndProcess(run.id);
    const r = await freshRun(run.id);
    expect(r.status).toBe("failed");
    expect(r.error?.code).toBe("APPROVAL_REJECTED");
    expect(calls).toEqual([]);
    expect((await fake.requests("slack")).filter((x) => x.path.includes("postMessage"))).toHaveLength(0);
  });
});
