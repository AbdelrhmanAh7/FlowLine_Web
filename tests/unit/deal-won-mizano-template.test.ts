import { describe, expect, it } from "vitest";
import { DESIGN_TEMPLATES, availableDesignTemplates, heldBackDesignTemplates, missingTemplateActions, templateActionIds } from "@/engine/design-templates";
import { getAction } from "@/integrations/registry";
import { executeGraph, NodeError, sampleInputFor, type HostHandler } from "@/engine/execute";
import type { FlowGraph } from "@/engine/types";
import { validateGraph } from "@/engine/validate";

const tpl = DESIGN_TEMPLATES.find((t) => t.id === "deal-won-mizano-quote")!;
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
      if (decision === "pending") return { kind: "pause", status: "waiting_approval", message: "Waiting for approval" };
      if (decision === "rejected") throw new NodeError("APPROVAL_REJECTED", `${cfg.actionId} rejected`);
    }
    calls.push({ action: cfg.actionId, args });
    return { kind: "ok", output: { id: cfg.actionId === "mizano.create_customer" ? "cust-1" : "Q-1", ok: true } };
  };
  return { calls, handler };
}

describe("Deal won → Mizano quote template", () => {
  it("wiring: resolves all action ids in registry and validates connections", () => {
    const calledIds = templateActionIds(tpl.graph);
    expect(calledIds).toEqual(["mizano.create_customer", "mizano.create_draft_quote", "slack.post_message"]);
    expect(missingTemplateActions(tpl.graph, new Set())).toEqual(calledIds);
    expect(missingTemplateActions(tpl.graph, { has: (id: string) => getAction(id) !== undefined })).toEqual([]);
    expect(validateGraph(setUp())).toEqual([]);
    expect(validateGraph(tpl.graph).map((i) => i.code)).toEqual(["MISSING_CONNECTION", "MISSING_CONNECTION", "MISSING_CONNECTION", "SETUP_REQUIRED"]);
    expect(tpl.requires.map((r) => r.provider)).toEqual(["mizano", "slack"]);
    const cfg = (id: string) => tpl.graph.nodes.find((n) => n.id === id)!.data.config as unknown as { actionId: string; requireApproval: boolean };
    expect(cfg("customer")).toMatchObject({ actionId: "mizano.create_customer", requireApproval: true });
    expect(cfg("quote").actionId).toBe("mizano.create_draft_quote");
  });

  it("is offered only once every action is registered and held back until then", () => {
    const called = ["mizano.create_customer", "mizano.create_draft_quote", "slack.post_message"];
    expect(availableDesignTemplates({ has: () => false }, [tpl])).toEqual([]);
    expect(heldBackDesignTemplates({ has: () => false }, [tpl])).toEqual([{ template: tpl, missing: called }]);
    const all = { has: (id: string) => new Set(called).has(id) };
    expect(availableDesignTemplates(all, [tpl])).toEqual([tpl]);
    expect(heldBackDesignTemplates(all, [tpl])).toEqual([]);
    const registry = { has: (id: string) => getAction(id) !== undefined };
    expect(availableDesignTemplates(registry, [tpl]).length).toBe(missingTemplateActions(tpl.graph, registry).length === 0 ? 1 : 0);
  });

  it("approval gating: pending pauses, rejected fails, approved creates customer and quote", async () => {
    const p = await executeGraph(setUp(), sampleInputFor(tpl.graph), { handler: mockMizano("pending").handler });
    expect(p.status).toBe("waiting_approval");
    expect(p.steps.find((s) => s.nodeId === "customer")!.status).toBe("waiting_approval");

    const r = await executeGraph(setUp(), sampleInputFor(tpl.graph), { handler: mockMizano("rejected").handler });
    expect(r.status).toBe("failed");
    expect(r.error).toMatchObject({ code: "APPROVAL_REJECTED", nodeId: "customer" });

    const ok = mockMizano("approved");
    const a = await executeGraph(setUp(), sampleInputFor(tpl.graph), { handler: ok.handler });
    expect(a.status).toBe("succeeded");
    expect(ok.calls.map((c) => c.action)).toEqual(["mizano.create_customer", "mizano.create_draft_quote", "slack.post_message"]);
    expect(ok.calls[0]!.args).toEqual({ name: "Mona Hassan", company: "Nile Bakery", email: "mona@nilebakery.example", phone: "+20 100 555 0142", taxId: "EG-100-200-300" });
    expect(ok.calls[1]!.args).toEqual({ customerId: "cust-1", currency: "EGP", lines: [{ item: "Oven service plan", qty: "1.00", unitPrice: "4800.00", taxRate: "14.00" }, { item: "Spare gasket kit", qty: "3.00", unitPrice: "125.50", taxRate: "14.00" }] });
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
