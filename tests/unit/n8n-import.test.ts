import { describe, expect, it } from "vitest";
import { n8nToFlow } from "@/server/n8n-import";
import { HttpError } from "@/server/http";

const workflow = {
  name: "Lead intake",
  nodes: [
    { name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 20], parameters: { path: "lead" } },
    { name: "Shape", type: "n8n-nodes-base.function", typeVersion: 1, position: [240, 20], parameters: { functionCode: "return items;" } },
    { name: "Notify", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [480, 20], parameters: { requestMethod: "POST", url: "https://example.com/hook" } },
  ],
  connections: {
    Webhook: { main: [[{ node: "Shape", type: "main", index: 0 }]] },
    Shape: { main: [[{ node: "Notify", type: "main", index: 0 }]] },
  },
};

describe("n8nToFlow", () => {
  it("maps webhook, function and HTTP nodes to FlowLine nodes with their positions", () => {
    const { graph } = n8nToFlow(workflow);
    expect(graph.nodes.map((n) => n.type)).toEqual(["trigger.webhook", "code.js", "http.request"]);
    expect(graph.nodes[0].position).toEqual({ x: 0, y: 20 });
    expect(graph.nodes[2].position).toEqual({ x: 480, y: 20 });
    expect((graph.nodes[1].data.config as { code: string }).code).toContain("return items;");
    expect(graph.nodes[2].data.config).toMatchObject({ method: "POST", url: '"https://example.com/hook"', sideEffect: "non_idempotent" });
    expect(graph.nodes[2].data.config).not.toHaveProperty("retry");
  });

  it("keeps GET requests retriable and idempotent", () => {
    const get = { ...workflow, nodes: [workflow.nodes[0], { ...workflow.nodes[2], parameters: { url: "https://example.com/a" } }], connections: {} };
    const [, http] = n8nToFlow(get).graph.nodes;
    expect(http.data.config).toMatchObject({ method: "GET", sideEffect: "none", retry: { maxAttempts: 3 } });
  });

  it("connects nodes from n8n connections", () => {
    const { graph } = n8nToFlow(workflow);
    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
      [graph.nodes[0].id, graph.nodes[1].id],
      [graph.nodes[1].id, graph.nodes[2].id],
    ]);
  });

  it("turns unsupported nodes into labelled placeholders that block running", () => {
    const { graph } = n8nToFlow({
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Sheet", type: "n8n-nodes-base.googleSheets", position: [240, 0], parameters: {} }],
      connections: { Hook: { main: [[{ node: "Sheet", type: "main", index: 0 }]] } },
    });
    const placeholder = graph.nodes[1];
    expect(placeholder.type).toBe("transform.json");
    expect(placeholder.data.label).toBe("Unsupported n8n node: n8n-nodes-base.googleSheets — replace");
    expect(placeholder.data.config).toEqual({ expression: '"REPLACE_WITH_N8N_NODES_BASE_GOOGLESHEETS"' });
  });

  it("rejects input that is not an n8n workflow", () => {
    expect(() => n8nToFlow(null)).toThrow(HttpError);
    expect(() => n8nToFlow({ nodes: "nope" })).toThrow(HttpError);
  });

  it("rejects connections to nodes that do not exist", () => {
    const bad = { ...workflow, connections: { Webhook: { main: [[{ node: "Ghost", type: "main", index: 0 }]] } } };
    expect(() => n8nToFlow(bad)).toThrow(/Ghost/);
    expect(() => n8nToFlow(bad)).toThrow(HttpError);
  });

  it("prepends a warning comment to imported Function/Code bodies", () => {
    const { graph } = n8nToFlow(workflow);
    const code = graph.nodes[1];
    expect(code.type).toBe("code.js");
    expect((code.data.config as { code: string }).code).toContain("// Code uses n8n items API - review before running");
  });

  it("adds a branch note to IF/Switch placeholders with multiple outputs", () => {
    const branched = {
      nodes: [
        { name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} },
        { name: "Route", type: "n8n-nodes-base.if", position: [240, 0], parameters: {} },
        { name: "A", type: "n8n-nodes-base.httpRequest", position: [480, 0], parameters: { url: "https://example.com/a" } },
        { name: "B", type: "n8n-nodes-base.httpRequest", position: [480, 200], parameters: { url: "https://example.com/b" } },
      ],
      connections: {
        Hook: { main: [[{ node: "Route", type: "main", index: 0 }]] },
        Route: { main: [[{ node: "A", type: "main", index: 0 }], [{ node: "B", type: "main", index: 0 }]] },
      },
    };
    const { graph } = n8nToFlow(branched);
    const route = graph.nodes[1];
    expect(route.type).toBe("transform.json");
    expect(route.data.label).toBe("Unsupported n8n node: n8n-nodes-base.if — replace");
    expect((route.data.config as { expression: string }).expression).toContain("Additional branches not imported in MVP - manual replacement needed");
  });

  it("replaces n8n expressions in HTTP URLs with placeholders", () => {
    const withExpr = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Fetch", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://example.com/{{ $json.id }}" } }],
      connections: { Hook: { main: [[{ node: "Fetch", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withExpr);
    const fetch = graph.nodes[1];
    expect(fetch.type).toBe("http.request");
    expect((fetch.data.config as { url: string }).url).toContain("[EXPRESSION:={{...}}]");
  });
});
