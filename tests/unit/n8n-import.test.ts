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

  it("turns HTTP nodes with expressions in URL into placeholders", () => {
    const withExpr = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Fetch", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://example.com/{{ $json.id }}" } }],
      connections: { Hook: { main: [[{ node: "Fetch", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withExpr);
    const fetch = graph.nodes[1];
    expect(fetch.type).toBe("transform.json");
    expect(fetch.data.label).toContain("Unsupported n8n node: n8n-nodes-base.httpRequest");
    expect((fetch.data.config as { expression: string }).expression).toContain("HTTP URL contains n8n expressions or credentials");
  });

  it("turns HTTP nodes with sendBody into placeholders", () => {
    const withBody = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Post", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "POST", url: "https://example.com/hook", sendBody: true, jsonBody: { foo: "bar" } } }],
      connections: { Hook: { main: [[{ node: "Post", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withBody);
    const post = graph.nodes[1];
    expect(post.type).toBe("transform.json");
    expect((post.data.config as { expression: string }).expression).toContain("HTTP body, headers or auth not imported");
  });

  it("turns HTTP nodes with custom headers into placeholders", () => {
    const withHeaders = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Post", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "POST", url: "https://example.com/hook", sendHeaders: true, headerParameters: [{ name: "X-Custom", value: "value" }] } }],
      connections: { Hook: { main: [[{ node: "Post", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withHeaders);
    const post = graph.nodes[1];
    expect(post.type).toBe("transform.json");
    expect((post.data.config as { expression: string }).expression).toContain("HTTP body, headers or auth not imported");
  });

  it("turns HTTP nodes with authentication into placeholders", () => {
    const withAuth = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Get", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "GET", url: "https://example.com/hook", authentication: "headerAuth" } }],
      connections: { Hook: { main: [[{ node: "Get", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withAuth);
    const get = graph.nodes[1];
    expect(get.type).toBe("transform.json");
    expect((get.data.config as { expression: string }).expression).toContain("HTTP body, headers or auth not imported");
  });

  it("maps HTTP node with plain JSON body (no expressions)", () => {
    const withJsonBody = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Post", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "POST", url: "https://example.com/hook", jsonBody: { key: "value" } } }],
      connections: { Hook: { main: [[{ node: "Post", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withJsonBody);
    const post = graph.nodes[1];
    expect(post.type).toBe("http.request");
    expect((post.data.config as { body: string }).body).toBe('{"key":"value"}');
  });

  it("maps HTTP node with plain headers (no expressions)", () => {
    const withHeaders = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Get", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "GET", url: "https://example.com/hook", headers: { "X-API-Key": "secret" } } }],
      connections: { Hook: { main: [[{ node: "Get", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withHeaders);
    const get = graph.nodes[1];
    expect(get.type).toBe("http.request");
    expect((get.data.config as { headers: string }).headers).toBe('{"X-API-Key":"secret"}');
  });

  it("uses V3 method parameter for HTTP node", () => {
    const v3Post = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Post", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "POST", url: "https://example.com/hook" } }],
      connections: { Hook: { main: [[{ node: "Post", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(v3Post);
    const post = graph.nodes[1];
    expect(post.type).toBe("http.request");
    expect((post.data.config as { method: string }).method).toBe("POST");
  });

  it("falls back to requestMethod when method is absent", () => {
    const legacyPost = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Post", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { requestMethod: "PUT", url: "https://example.com/hook" } }],
      connections: { Hook: { main: [[{ node: "Post", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(legacyPost);
    const post = graph.nodes[1];
    expect(post.type).toBe("http.request");
    expect((post.data.config as { method: string }).method).toBe("PUT");
  });

  it("rejects code longer than MAX_CODE_LENGTH as placeholder", () => {
    const longCode = "x".repeat(20001);
    const withLongCode = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Code", type: "n8n-nodes-base.function", position: [240, 0], parameters: { functionCode: longCode } }],
      connections: { Hook: { main: [[{ node: "Code", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(withLongCode);
    const code = graph.nodes[1];
    expect(code.type).toBe("transform.json");
    expect((code.data.config as { expression: string }).expression).toContain("code is longer than 20000 characters");
  });

  it("rejects duplicate node names", () => {
    const dupNames = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Hook", type: "n8n-nodes-base.function", position: [240, 0], parameters: {} }],
      connections: {},
    };
    expect(() => n8nToFlow(dupNames)).toThrow(/Two nodes are named "Hook"/);
  });

  it("rejects self-connections", () => {
    const selfConn = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Process", type: "n8n-nodes-base.function", position: [240, 0], parameters: { functionCode: "return items;" } }],
      connections: { Process: { main: [[{ node: "Process", type: "main", index: 0 }]] } },
    };
    expect(() => n8nToFlow(selfConn)).toThrow(/connected to itself/);
  });

  it("collapses duplicate edges to one", () => {
    const dupEdges = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Process", type: "n8n-nodes-base.function", position: [240, 0], parameters: { functionCode: "return items;" } }, { name: "Notify", type: "n8n-nodes-base.httpRequest", position: [480, 0], parameters: { method: "POST", url: "https://example.com/hook" } }],
      connections: {
        Hook: { main: [[{ node: "Process", type: "main", index: 0 }], [{ node: "Process", type: "main", index: 0 }]] },
        Process: { main: [[{ node: "Notify", type: "main", index: 0 }]] },
      },
    };
    const { graph } = n8nToFlow(dupEdges);
    const edges = graph.edges.filter(e => e.source === graph.nodes[0].id && e.target === graph.nodes[1].id);
    expect(edges.length).toBe(1);
  });

  it("rejects unsupported HTTP method", () => {
    const badMethod = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Fetch", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "OPTIONS", url: "https://example.com/hook" } }],
      connections: { Hook: { main: [[{ node: "Fetch", type: "main", index: 0 }]] } },
    };
    const { graph } = n8nToFlow(badMethod);
    const fetch = graph.nodes[1];
    expect(fetch.type).toBe("transform.json");
  });

  it("rejects graph exceeding 512 KB", () => {
    // Create a workflow with many nodes with large code to exceed 512 KB
    const manyNodes = Array.from({ length: 95 }, (_, i) => ({
      name: `Node${i}`,
      type: "n8n-nodes-base.function",
      position: [i * 10, 0],
      parameters: { functionCode: "x".repeat(6000) }, // ~6KB each, 95 * 6KB = ~570KB + other overhead > 512KB
    }));
    const huge = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, ...manyNodes],
      connections: {},
    };
    expect(() => n8nToFlow(huge)).toThrow(/too large to import/);
  });
});
