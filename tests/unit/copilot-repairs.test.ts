import { describe, expect, it } from "vitest";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import type { FlowGraph } from "@/engine/types";
import { unavailableAppsIn } from "@/server/copilot-apps";
import { applyPatch, type CopilotPatch } from "@/server/copilot-patch";

/** Deterministic repairs behind CX3Q-02/03 (real-model Copilot output); the validator still has the final word. */
const lead = () => structuredClone(LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!.graph) as FlowGraph;
const patch = (p: Partial<CopilotPatch>): CopilotPatch => ({ summary: "", addNodes: [], updateNodes: [], removeNodes: [], addEdges: [], removeEdges: [], ...p });
const errors = (r: ReturnType<typeof applyPatch>) => r.issues.filter((i) => i.severity === "error");

describe("Copilot patch repairs", () => {
  it("resolves a re-spelled id to the single matching step, with a warning", () => {
    const r = applyPatch(lead(), patch({ updateNodes: [{ id: "IS_HOT", label: "Hot?" }] }), []);
    expect(errors(r)).toEqual([]);
    expect(r.graph.nodes.find((n) => n.id === "is-hot")!.data.label).toBe("Hot?");
    expect(r.issues.map((i) => i.code)).toContain("RESOLVED_REFERENCE");
  });

  it("inserts a step with `after`, taking over that step's connections; a condition continues on its true branch", () => {
    const r = applyPatch(lead(), patch({ addNodes: [{ id: "has_email", type: "logic.condition", label: "Has email?", config: {}, after: "normalise" }] }), []);
    expect(errors(r).filter((e) => e.code !== "SETUP_REQUIRED")).toEqual([]);
    expect(r.graph.edges.some((e) => e.source === "normalise" && e.target === "has_email")).toBe(true);
    expect(r.graph.edges.some((e) => e.source === "has_email" && e.target === "is-hot" && e.sourceHandle === "true")).toBe(true);
    expect(r.graph.edges.some((e) => e.source === "normalise" && e.target === "is-hot")).toBe(false);
  });

  it("a step placed after an output goes just before it (outputs end a workflow), and says so", () => {
    const r = applyPatch(lead(), patch({ addNodes: [{ id: "stamp", type: "transform.json", label: "Stamp", config: { expression: "$" }, after: "hot" }] }), []);
    expect(errors(r)).toEqual([]);
    expect(r.issues.map((i) => i.code)).toContain("PLACED_BEFORE_OUTPUT");
    expect(r.graph.edges.some((e) => e.source === "stamp" && e.target === "hot")).toBe(true);
    expect(r.graph.edges.some((e) => e.source === "hot")).toBe(false);
  });

  it("edges from two outputs into a new step: placed before one, the other connection dropped with a warning", () => {
    const r = applyPatch(lead(), patch({ addNodes: [{ id: "stamp", type: "transform.json", label: "Stamp", config: { expression: "$" } }], addEdges: [{ source: "hot", target: "stamp" }, { source: "nurture", target: "stamp" }] }), []);
    expect(errors(r)).toEqual([]);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["PLACED_BEFORE_OUTPUT", "CONNECTION_DROPPED"]));
  });

  it("an action id used as a step type becomes that integration step (setup still required); an invented one stays an error", () => {
    const ok = applyPatch(lead(), patch({ addNodes: [{ id: "post", type: "slack.post_message", label: "Tell sales", config: { channel: "#sales", text: "Hot lead" }, after: "is-hot" }] }), []);
    const post = ok.graph.nodes.find((n) => n.id === "post")!;
    expect(post.type).toBe("integration.action");
    expect(post.data.config).toMatchObject({ actionId: "slack.post_message", connectionId: "" });
    expect(ok.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["CONVERTED_TO_INTEGRATION", "MISSING_CREDENTIAL"]));
    const bad = applyPatch(lead(), patch({ addNodes: [{ id: "q", type: "data.postgres.query", label: "Query", config: {} }] }), []);
    expect(errors(bad).map((e) => e.code)).toContain("UNKNOWN_NODE_TYPE");
  });

  it("a non-branch sourceHandle is ignored (a condition then follows its true branch, as the engine defines)", () => {
    const r = applyPatch({ nodes: [], edges: [] }, patch({
      addNodes: [
        { id: "t", type: "trigger.manual", label: "Start", config: {} },
        { id: "c", type: "logic.condition", label: "Check", config: {} },
        { id: "o", type: "output", label: "Out", config: {} },
      ],
      addEdges: [{ source: "t", target: "c", sourceHandle: "output" }, { source: "c", target: "o", sourceHandle: "yes" }],
    }), []);
    expect(r.graph.edges.find((e) => e.source === "t")!.sourceHandle).toBeNull();
    expect(r.graph.edges.find((e) => e.source === "c")!.sourceHandle).toBeNull();
    expect(errors(r).filter((e) => e.code !== "SETUP_REQUIRED")).toEqual([]);
  });
});

describe("unavailable apps", () => {
  it("names apps Flowline can't connect to, never the available ones, whole words only", () => {
    expect(unavailableAppsIn("Create a lead in Salesforce when a form arrives")).toEqual(["Salesforce"]);
    expect(unavailableAppsIn("post to Discord and Microsoft Teams")).toEqual(["Discord", "Microsoft Teams"]);
    expect(unavailableAppsIn("add a row in Google Sheets and ping Slack")).toEqual([]);
    expect(unavailableAppsIn("put it in a box or drop it")).toEqual(["Box"]); // documented: common words that are also app names match
    expect(unavailableAppsIn("the boxes are sorted")).toEqual([]);
  });
});
