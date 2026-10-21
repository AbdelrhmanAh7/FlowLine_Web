import { describe, expect, it } from "vitest";
import { isN8nWorkflow, n8nToFlow } from "@/server/n8n-import";
import { validateGraph } from "@/engine/validate";
import { HttpError } from "@/server/http";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";

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
    expect(setup.message).toContain("REPLACE_WITH_UNSUPPORTED_N8N_NODE");
  });

  it("rejects an unsupported trigger or a lone unsupported node: NO_TRIGGER plus the placeholder block", () => {
    const unknownTrigger = n8nToFlow({ nodes: [{ name: "Cron", type: "n8n-nodes-base.scheduleTrigger", position: [0, 0], parameters: {} }], connections: {} }).graph;
    expect(unknownTrigger.nodes[0].type).toBe("transform.json");
    const codes = validateGraph(unknownTrigger).map((i) => i.code);
    expect(codes).toContain("SETUP_REQUIRED");
    expect(codes).toContain("NO_TRIGGER");
  });

  it("accepts a workflow with no name or no connections", () => {
    const res = n8nToFlow({
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }],
    });
    expect(res.name).toBe("Imported n8n workflow");
    expect(res.graph.edges).toHaveLength(0);
  });

  it("replaces non-alphanumeric chars in unsupported node token", () => {
    const { graph } = n8nToFlow({
      nodes: [{ name: "Special", type: "custom.plugin-v2@alpha", position: [0, 0], parameters: {} }],
      connections: {},
    });
    const placeholder = graph.nodes[0];
    expect((placeholder.data.config as { expression: string }).expression).toBe('"REPLACE_WITH_CUSTOM_PLUGIN_V2_ALPHA"');
  });

  it("truncates unsupported node type in label to 40 chars", () => {
    const longType = "a".repeat(50);
    const { graph } = n8nToFlow({
      nodes: [{ name: "Long", type: longType, position: [0, 0], parameters: {} }],
      connections: {},
    });
    const placeholder = graph.nodes[0];
    expect(placeholder.data.label).toBe(`Unsupported n8n node: ${"a".repeat(40)} — replace`);
  });

  it("rejects input that is not an n8n workflow", () => {
    for (const bad of [null, undefined, 42, "{}", { nodes: [] }, { nodes: [{ type: "missing-name" }] }]) {
      expect(() => n8nToFlow(bad)).toThrowError(HttpError);
    }
    let thrown: unknown;
    try {
      n8nToFlow({ foo: "bar" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).code).toBe("INVALID_N8N_JSON");
    expect((thrown as HttpError).status).toBe(400);
  });

  it("turns httpRequest node with n8n expressions in URL into a placeholder", () => {
    const withExpr = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Req", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://api.example.com/{{ $json.id }}" } }],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    const node = n8nToFlow(withExpr).graph.nodes[1];
    expect(node.type).toBe("transform.json");
    expect((node.data.config as { expression: string }).expression).toContain("expressions or credentials");
  });

  it("turns httpRequest node with credentials in URL into a placeholder", () => {
    const withCred = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Req", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://[CREDENTIAL:apiKey]@api.example.com" } }],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    const node = n8nToFlow(withCred).graph.nodes[1];
    expect(node.type).toBe("transform.json");
    expect((node.data.config as { expression: string }).expression).toContain("expressions or credentials");
  });

  it("turns httpRequest node with = expression URL into a placeholder", () => {
    const withEquals = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Req", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "=https://api.example.com/test" } }],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    const node = n8nToFlow(withEquals).graph.nodes[1];
    expect(node.type).toBe("transform.json");
    expect((node.data.config as { expression: string }).expression).toContain("expressions or credentials");
  });

  it("turns httpRequest node with unpreserved body into a placeholder", () => {
    const withBody = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Req", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://example.com", bodyParameters: [{ name: "a", value: "b" }] } }],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    expect(n8nToFlow(withBody).graph.nodes[1].type).toBe("transform.json");
  });

  it("turns httpRequest node with unpreserved headers into a placeholder", () => {
    const withHeaders = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Req", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://example.com", headerParameters: [{ name: "Authorization", value: "Bearer token" }] } }],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    expect(n8nToFlow(withHeaders).graph.nodes[1].type).toBe("transform.json");
  });

  it("turns httpRequest node with authentication into a placeholder", () => {
    const withAuth = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, { name: "Req", type: "n8n-nodes-base.httpRequest", position: [240, 0], parameters: { url: "https://example.com", authentication: "genericCredentialType" } }],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    expect(n8nToFlow(withAuth).graph.nodes[1].type).toBe("transform.json");
  });

  it("maps plain body and string headers for httpRequest node", () => {
    const validHttp = {
      nodes: [
        { name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} },
        {
          name: "Req",
          type: "n8n-nodes-base.httpRequest",
          position: [240, 0],
          parameters: {
            method: "POST",
            url: "https://example.com/api",
            headers: { "Content-Type": "application/json" },
            jsonBody: { hello: "world" },
          },
        },
      ],
      connections: { Hook: { main: [[{ node: "Req", type: "main", index: 0 }]] } },
    };
    const node = n8nToFlow(validHttp).graph.nodes[1];
    expect(node.type).toBe("http.request");
    expect(node.data.config).toMatchObject({
      method: "POST",
      url: '"https://example.com/api"',
      headers: JSON.stringify({ "Content-Type": "application/json" }),
      body: '{"hello":"world"}',
    });
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

  it("maps n8n jsCode parameter as well as functionCode", () => {
    const res = n8nToFlow({
      nodes: [{ name: "Fn", type: "n8n-nodes-base.code", position: [0, 0], parameters: { jsCode: "return [{ json: {} }];" } }],
    });
    const code = (res.graph.nodes[0].data.config as { code: string }).code;
    expect(code).toContain("return [{ json: {} }];");
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
    const manyNodes = Array.from({ length: 95 }, (_, i) => ({
      name: `Node${i}`,
      type: "n8n-nodes-base.function",
      position: [i * 10, 0],
      parameters: { functionCode: "x".repeat(6000) },
    }));
    const huge = {
      nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook", position: [0, 0], parameters: {} }, ...manyNodes],
      connections: {},
    };
    expect(() => n8nToFlow(huge)).toThrow(/too large to import/);
  });

  it("parses string workflow input and strips UTF-8 BOM", () => {
    const jsonStr = "\uFEFF" + JSON.stringify(workflow);
    const { graph } = n8nToFlow(jsonStr);
    expect(graph.nodes).toHaveLength(3);
  });

  it("handles extra n8n workflow export properties (meta, pinData, settings)", () => {
    const extra = {
      ...workflow,
      meta: { templateCredsSetupCompleted: true, instanceId: "test-123" },
      pinData: { Webhook: [{ json: { foo: "bar" } }] },
      versionId: "12345",
      settings: { executionOrder: "v1" },
    };
    const { graph } = n8nToFlow(extra);
    expect(graph.nodes).toHaveLength(3);
  });

  it("isN8nWorkflow validates n8n workflow structure thoroughly", () => {
    expect(isN8nWorkflow(workflow)).toBe(true);
    expect(isN8nWorkflow({ nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook" }] })).toBe(true);

    // Rejects non-objects and primitives
    expect(isN8nWorkflow(null)).toBe(false);
    expect(isN8nWorkflow(undefined)).toBe(false);
    expect(isN8nWorkflow(42)).toBe(false);
    expect(isN8nWorkflow("string")).toBe(false);
    expect(isN8nWorkflow([])).toBe(false);

    // Rejects empty or missing nodes
    expect(isN8nWorkflow({})).toBe(false);
    expect(isN8nWorkflow({ nodes: [] })).toBe(false);
    expect(isN8nWorkflow({ foo: "bar" })).toBe(false);

    // Rejects nodes with missing or invalid name/type
    expect(isN8nWorkflow({ nodes: [{}] })).toBe(false);
    expect(isN8nWorkflow({ nodes: [{ name: "Hook" }] })).toBe(false);
    expect(isN8nWorkflow({ nodes: [{ type: "n8n-nodes-base.webhook" }] })).toBe(false);
    expect(isN8nWorkflow({ nodes: [{ name: "", type: "n8n-nodes-base.webhook" }] })).toBe(false);
    expect(isN8nWorkflow({ nodes: [{ name: "Hook", type: "" }] })).toBe(false);
    expect(isN8nWorkflow({ nodes: ["not-an-object"] })).toBe(false);

    // Rejects invalid connections structure
    expect(isN8nWorkflow({ nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook" }], connections: "invalid" })).toBe(false);
    expect(isN8nWorkflow({ nodes: [{ name: "Hook", type: "n8n-nodes-base.webhook" }], connections: [1, 2] })).toBe(false);
  });

  it("has exact upload button text matching e2e requirements in en and ar", () => {
    expect(en.flows.importN8nFile).toBe("Upload .json file");
    expect(ar.flows.importN8nFile).toBe("رفع ملف .json");
  });
});
