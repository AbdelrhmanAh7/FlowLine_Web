import { describe, expect, it } from "vitest";
import { DESIGN_TEMPLATES, availableDesignTemplates, heldBackDesignTemplates, missingTemplateActions, templateActionIds } from "@/engine/design-templates";
import { getAction } from "@/integrations/registry";
import { executeGraph, NodeError, sampleInputFor, type HostHandler } from "@/engine/execute";
import type { FlowGraph } from "@/engine/types";
import { validateGraph } from "@/engine/validate";

/**
 * "Deal won → Mizano quote" run through the engine with a mocked Mizano: a host handler stands in for the worker's approval gate.
 * This checks the graph wiring and data flow; the real worker, approval and rejection path is
 * tests/integration/deal-won-mizano-approval.test.ts.
 */

const tpl = DESIGN_TEMPLATES.find((t) => t.id === "deal-won-mizano-quote")!;

/** What a user does after "Use template": pick connections and replace the placeholders. */
function setUp(): FlowGraph {
  const g = structuredClone(tpl.graph);
  for (const n of g.nodes) {
    const cfg = n.data.config as unknown as Record<string, unknown>;
    if (n.type === "integration.action") cfg.connectionId = `conn-${String(cfg.actionId).split(".")[0]}`;
    for (const [k, v] of Object.entries(cfg)) if (typeof v === "string") cfg[k] = v.replace(/REPLACE_WITH_CHANNEL_ID/g, "C_SALES");
  }
  return g;
}

type Call = { action: string; args: Record<string, unknown> };
function mockMizano(decision: "pending" | "approved" | "rejected") {
  const calls: Call[] = [];
  const handler: HostHandler = async (node, input, env) => {
    const cfg = node.data.config as unknown as { actionId: string; inputMapping: string; requireApproval: boolean };
    const args = (await env.evaluate(cfg.inputMapping, input)) as Record<string, unknown>;
    if (cfg.requireApproval === true) {
      if (decision === "pending") return { kind: "pause", status: "waiting_approval", message: `Waiting for approval to run ${cfg.actionId}` };
      if (decision === "rejected") throw new NodeError("APPROVAL_REJECTED", `${cfg.actionId} was rejected`);
    }
    calls.push({ action: cfg.actionId, args });
    if (cfg.actionId === "mizano.create_customer") return { kind: "ok", output: { id: "cust-1" } }; // like Mizano: an id, not an echo of the request
    if (cfg.actionId === "mizano.create_draft_quote") return { kind: "ok", output: { id: "Q-1" } };
    return { kind: "ok", output: { ok: true } };
  };
  return { calls, handler };
}

describe("Deal won → Mizano quote template", () => {
  it("calls only action ids that resolve in the real provider registry once #147 lands, and no others", () => {
    // The exact ids the template calls, in node order.
    const calledIds = templateActionIds(tpl.graph);
    expect(calledIds).toEqual(["mizano.create_customer", "mizano.create_draft_quote", "slack.post_message"]);
    expect(missingTemplateActions(tpl.graph, new Set())).toEqual(calledIds);
    expect(missingTemplateActions(tpl.graph, new Set(calledIds))).toEqual([]);
    // Against the REAL provider registry (no stand-ins): the two Mizano create actions resolve exactly when #147 is
    // merged, Slack always does, and every other template resolves in full. A renamed or dropped id fails here.
    const registry = { has: (id: string) => getAction(id) !== undefined };
    const unresolved = calledIds.filter((id) => !registry.has(id));
    expect(unresolved).toEqual(["mizano.create_customer", "mizano.create_draft_quote"].filter((id) => !registry.has(id)));
    expect(missingTemplateActions(tpl.graph, registry)).toEqual(unresolved);
    expect(getAction("slack.post_message")).toBeDefined();
    for (const other of DESIGN_TEMPLATES.filter((t) => t.id !== tpl.id)) expect(missingTemplateActions(other.graph, registry), other.id).toEqual([]);
  });

  it("is offered only once every action it calls is registered, and held back until then", () => {
    const called = ["mizano.create_customer", "mizano.create_draft_quote", "slack.post_message"];
    // No action registered: the template is held back with exactly the ids it needs, and not offered.
    const none = { has: () => false };
    expect(availableDesignTemplates(none, [tpl])).toEqual([]);
    expect(heldBackDesignTemplates(none, [tpl])).toEqual([{ template: tpl, missing: called }]);

    // A registry that provides the two Mizano actions (#147 merged, or any registry doing so): offered, nothing held back.
    const ids = new Set(called);
    const all = { has: (id: string) => ids.has(id) };
    expect(availableDesignTemplates(all, [tpl])).toEqual([tpl]);
    expect(heldBackDesignTemplates(all, [tpl])).toEqual([]);
    expect(missingTemplateActions(tpl.graph, all)).toEqual([]); // every actionId resolves once #147's actions land

    // Against the real registry this mirrors the gallery and createFlow exactly: offered iff every id resolves.
    const registry = { has: (id: string) => getAction(id) !== undefined };
    const missing = missingTemplateActions(tpl.graph, registry);
    expect(availableDesignTemplates(registry, [tpl]).length).toBe(missing.length === 0 ? 1 : 0);
    expect(heldBackDesignTemplates(registry, [tpl]).length).toBe(missing.length === 0 ? 0 : 1);
  });

  it("needs only the Mizano and Slack connections, and nothing else, before it can run", () => {
    expect(validateGraph(setUp())).toEqual([]);
    // validateGraph judges wiring, not action ids (no UNKNOWN_ACTION here): the gallery's held-back list and
    // createFlow's 409 are what keep an unregistered action out.
    expect(validateGraph(tpl.graph).map((i) => i.code)).toEqual(["MISSING_CONNECTION", "MISSING_CONNECTION", "MISSING_CONNECTION", "SETUP_REQUIRED"]);
    expect(tpl.requires.map((r) => r.provider)).toEqual(["mizano", "slack"]);
  });

  it("puts the approval on the first Mizano call, so nothing reaches Mizano before it is granted", () => {
    const cfg = (id: string) => tpl.graph.nodes.find((n) => n.id === id)!.data.config as unknown as { actionId: string; requireApproval: boolean };
    expect(cfg("customer")).toMatchObject({ actionId: "mizano.create_customer", requireApproval: true });
    expect(cfg("quote").actionId).toBe("mizano.create_draft_quote");
    const mizano = tpl.graph.nodes.filter((n) => (n.data.config as { actionId?: string }).actionId?.startsWith("mizano."));
    expect(mizano.map((n) => n.id)).toEqual(["customer", "quote"]);
    expect(tpl.graph.edges.filter((e) => e.target === "customer").map((e) => e.source)).toEqual(["prepare"]);
  });

  it("blocks at the approval while it is pending: no Mizano call is made", async () => {
    const { calls, handler } = mockMizano("pending");
    const res = await executeGraph(setUp(), sampleInputFor(tpl.graph), { handler });
    expect(res.status).toBe("waiting_approval");
    expect(calls).toEqual([]);
    expect(res.steps.find((s) => s.nodeId === "customer")!.status).toBe("waiting_approval");
    expect(res.steps.some((s) => s.nodeId === "quote")).toBe(false);
  });

  it("rejecting ends the run with no call to Mizano and no Slack message", async () => {
    const { calls, handler } = mockMizano("rejected");
    const res = await executeGraph(setUp(), sampleInputFor(tpl.graph), { handler });
    expect(res.status).toBe("failed");
    expect(res.error).toMatchObject({ code: "APPROVAL_REJECTED", nodeId: "customer" });
    expect(calls).toEqual([]);
  });

  it("approved: creates the customer, then a draft quote for that customer with two-decimal amounts, then tells Slack", async () => {
    const { calls, handler } = mockMizano("approved");
    const res = await executeGraph(setUp(), sampleInputFor(tpl.graph), { handler });
    expect(res.error).toBeNull();
    expect(res.status).toBe("succeeded");
    expect(calls.map((c) => c.action)).toEqual(["mizano.create_customer", "mizano.create_draft_quote", "slack.post_message"]);
    expect(calls[0]!.args).toEqual({
      name: "Mona Hassan",
      company: "Nile Bakery",
      email: "mona@nilebakery.example",
      phone: "+20 100 555 0142",
      taxId: "EG-100-200-300",
      lines: [
        { item: "Oven service plan", qty: "1.00", unitPrice: "4800.00", taxRate: "14.00" },
        { item: "Spare gasket kit", qty: "3.00", unitPrice: "125.50", taxRate: "14.00" },
      ],
    });
    expect(calls[1]!.args).toEqual({
      customerId: "cust-1",
      currency: "EGP",
      lines: [
        { item: "Oven service plan", qty: "1.00", unitPrice: "4800.00", taxRate: "14.00" },
        { item: "Spare gasket kit", qty: "3.00", unitPrice: "125.50", taxRate: "14.00" },
      ],
    });
    expect(calls[2]!.args).toEqual({ channel: "C_SALES", text: "Draft quote Q-1 created in Mizano for Nile Bakery (2 lines)" });
  });

  it("a deal that is not won sends nothing", async () => {
    const { calls, handler } = mockMizano("approved");
    const input = structuredClone(sampleInputFor(tpl.graph)) as { deal: { stage: string } };
    input.deal.stage = "lost";
    const res = await executeGraph(setUp(), input, { handler });
    expect(res.status).toBe("succeeded");
    expect(calls).toEqual([]);
    expect(res.output).toEqual({ status: "deal not won: nothing sent to Mizano" });
  });
});
