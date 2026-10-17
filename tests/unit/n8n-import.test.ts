import { describe, expect, it } from "vitest";
import { n8nToFlow } from "@/server/n8n-import";
import { validateGraph } from "@/engine/validate";
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
    // `placeholder: true` is the flag validateGraph rejects, independent of the REPLACE_WITH_ marker text.
    expect(placeholder.data.config).toEqual({ expression: '"REPLACE_WITH_N8N_NODES_BASE_GOOGLESHEETS"', placeholder: true });
  });

  it("validateGraph rejects an imported graph that still holds a placeholder, so it cannot run or publish", () => {
    const { graph } = n8nToFlow({
      nodes: [
        { name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} },
        { name: "Shape", type: "n8n-nodes-base.function", position: [240, 0], parameters: { functionCode: "return items;" } },
        { name: "Sheet", type: "n8n-nodes-base.googleSheets", position: [480, 0], parameters: {} },
      ],
      connections: { Hook: { main: [[{ node: "Shape", type: "main", index: 0 }]] }, Shape: { main: [[{ node: "Sheet", type: "main", index: 0 }]] } },
    });
    const issues = validateGraph(graph);
    // No placeholder may run: the flow is refused (runs.ts and publish.ts both call validateGraph).
    expect(issues.map((i) => i.code)).toContain("SETUP_REQUIRED");
    const setup = issues.find((i) => i.code === "SETUP_REQUIRED")!;
    expect(setup.nodeId).toBe(graph.nodes[2].id);
    expect(setup.message).toContain("finish setup — replace REPLACE_WITH_N8N_NODES_BASE_GOOGLESHEETS");
  });

  it("a placeholder flag alone still blocks validation (marker text is not required)", () => {
    const graph = {
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: {} } },
        { id: "p", type: "transform.json", position: { x: 240, y: 0 }, data: { label: "Unsupported n8n node: n8n-nodes-base.set — replace", config: { placeholder: true } } },
      ],
      edges: [{ id: "e0", source: "t", target: "p", sourceHandle: "out", targetHandle: null }],
    } as unknown as Parameters<typeof validateGraph>[0];
    const setup = validateGraph(graph).find((i) => i.code === "SETUP_REQUIRED")!;
    expect(setup.nodeId).toBe("p");
  });

  it("rejects an unsupported trigger or a lone unsupported node: NO_TRIGGER plus the placeholder block", () => {
    const unknownTrigger = n8nToFlow({ nodes: [{ name: "Cron", type: "n8n-nodes-base.scheduleTrigger", position: [0, 0], parameters: {} }], connections: {} }).graph;
    expect(unknownTrigger.nodes[0].type).toBe("transform.json");
    const codes = validateGraph(unknownTrigger).map((i) => i.code);
    expect(codes).toContain("SETUP_REQUIRED");
    expect(codes).toContain("NO_TRIGGER");
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

  it("makes an HTTP node a placeholder when its jsonBody holds an expression (never an empty request)", () => {
    const withExprBody = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Post", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "POST", url: "https://example.com/hook", jsonBody: { id: "{{ $json.id }}" } } }],
      connections: { Hook: { main: [[{ node: "Post", type: "main", index: 0 }]] } },
    };
    const post = n8nToFlow(withExprBody).graph.nodes[1];
    expect(post.type).toBe("transform.json");
    expect((post.data.config as { placeholder?: boolean }).placeholder).toBe(true);
    expect((post.data.config as { expression: string }).expression).toContain("HTTP body, headers or auth not imported");
  });

  it("makes an HTTP node a placeholder when a headers object holds an expression or a non-string value", () => {
    const withExprHeader = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Get", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "GET", url: "https://example.com/hook", headers: { "X-Key": "{{ $json.key }}" } } }],
      connections: { Hook: { main: [[{ node: "Get", type: "main", index: 0 }]] } },
    };
    expect(n8nToFlow(withExprHeader).graph.nodes[1].type).toBe("transform.json");

    const withNonStringHeader = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Get", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { method: "GET", url: "https://example.com/hook", headers: { "X-Count": 5 } } }],
      connections: { Hook: { main: [[{ node: "Get", type: "main", index: 0 }]] } },
    };
    expect(n8nToFlow(withNonStringHeader).graph.nodes[1].type).toBe("transform.json");
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

  describe("HTTP payload config that cannot be preserved becomes a placeholder, never an empty request", () => {
    const http = (typeVersion: number, parameters: Record<string, unknown>) =>
      n8nToFlow({
        nodes: [
          { name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} },
          { name: "Call", type: "n8n-nodes-base.httpRequest", typeVersion, position: [240, 0], parameters: { url: "https://example.com/hook", ...parameters } },
        ],
        connections: { Hook: { main: [[{ node: "Call", type: "main", index: 0 }]] } },
      }).graph.nodes[1];
    const expectPlaceholder = (node: ReturnType<typeof http>) => {
      expect(node.type).toBe("transform.json");
      expect((node.data.config as { placeholder?: boolean }).placeholder).toBe(true);
      const graph = { nodes: [{ id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: {} } }, node], edges: [] } as unknown as Parameters<typeof validateGraph>[0];
      expect(validateGraph(graph).map((i) => i.code)).toContain("SETUP_REQUIRED");
    };

    it("current HTTP node (parameters.method POST, no requestMethod) maps to POST with a non-idempotent side effect", () => {
      const node = http(4, { method: "POST" });
      expect(node.type).toBe("http.request");
      expect(node.data.config).toMatchObject({ method: "POST", sideEffect: "non_idempotent" });
      expect(node.data.config).not.toHaveProperty("retry");
    });

    it.each([
      ["sendBody", { method: "POST", sendBody: true }],
      ["sendHeaders", { sendHeaders: true }],
      ["sendQuery", { sendQuery: true }],
      ["authentication", { authentication: "genericCredentialType" }],
    ])("a current HTTP node with %s is a placeholder that fails validateGraph with SETUP_REQUIRED", (_name, parameters) => {
      expectPlaceholder(http(4, parameters));
    });

    it.each([
      ["bodyParametersUi", { bodyParametersUi: { parameter: [{ name: "a", value: "1" }] } }],
      ["headerParametersUi", { headerParametersUi: { parameter: [{ name: "X-Key", value: "k" }] } }],
      ["queryParametersUi", { queryParametersUi: { parameter: [{ name: "q", value: "1" }] } }],
      ["bodyParametersJson (string)", { jsonParameters: true, bodyParametersJson: '{"a":1}' }],
      ["headerParametersJson (string)", { jsonParameters: true, headerParametersJson: '{"X-Key":"k"}' }],
      ["queryParametersJson (object)", { jsonParameters: true, queryParametersJson: { q: 1 } }],
      ["a string jsonBody", { jsonBody: '{"a":1}' }],
      ["an array jsonBody", { jsonBody: [{ a: 1 }] }],
    ])("a legacy (v1) POST with %s is a placeholder", (_name, extra) => {
      expectPlaceholder(http(1, { requestMethod: "POST", ...extra }));
    });

    it("legacy (v1) empty parameter lists do not turn a plain request into a placeholder", () => {
      const node = http(1, { requestMethod: "POST", bodyParametersUi: { parameter: [] }, headerParametersUi: {}, queryParametersJson: "", jsonParameters: false });
      expect(node.type).toBe("http.request");
    });
  });
});
