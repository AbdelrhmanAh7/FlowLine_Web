/**
 * Deterministic TEST DOUBLE for the AI provider boundary (Ollama-compatible /api/chat).
 * Used only by the deterministic suites (FLOWLINE_ENV=test). It is NOT a model:
 * it extracts "Key: value" pairs from the untrusted content by simple rules so tests
 * can assert exact outputs. Fault injection: POST /__fake/fault {mode:"500"|"timeout"|"bad_json", times}.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: string[];
  items?: Schema;
}

type Fault = { mode: "500" | "timeout" | "bad_json"; times: number };

const state = { requests: [] as { at: string; model: string; hasSchema: boolean; content: string }[], faults: [] as Fault[] };

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

const aliases: Record<string, string[]> = {
  vendor: ["vendor", "supplier", "from"],
  total: ["total", "amount due", "amount"],
  due_date: ["due", "due date"],
  invoice_number: ["invoice", "invoice number", "inv"],
  company: ["company", "organization"],
  domain: ["domain"],
  industry: ["industry"],
  headcount: ["employees", "headcount"],
  title: ["title", "role"],
  priority: ["priority"],
  team: ["team"],
  currency: ["currency"],
};

function findValue(content: string, key: string, type: string | undefined): unknown {
  const names = aliases[key] ?? [key.replace(/_/g, " ")];
  for (const n of names) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*[:=#]?\\s*([^\\n;]{1,80})`, "i");
    const m = content.match(re);
    if (!m) continue;
    // Stop at the next "Key:" label on the same line.
    const raw = m[1]!.replace(/\s+[A-Z][A-Za-z_]{1,20}:.*$/, "").replace(/,\s*$/, "").trim();
    if (type === "number" || type === "integer") {
      const numMatch = raw.match(/-?[\d,]+(?:\.\d+)?/);
      const num = numMatch ? Number(numMatch[0].replace(/,/g, "")) : NaN;
      if (Number.isFinite(num)) return type === "integer" ? Math.round(num) : num;
      continue;
    }
    if (key === "due_date") {
      const d = raw.match(/\d{4}-\d{2}-\d{2}/);
      if (d) return d[0];
    }
    return raw.replace(/\s+(Total|Due|Vendor)\b.*$/i, "").trim();
  }
  return undefined;
}

function fill(schema: Schema, content: string): unknown {
  if (schema.enum) {
    const lc = content.toLowerCase();
    // keyword heuristics for common label sets
    const hit = schema.enum.find((l) => lc.includes(l.toLowerCase()));
    if (hit) return hit;
    if (schema.enum.includes("urgent") && /(down|outage|breach|cannot log ?in|all users)/i.test(content)) return "urgent";
    if (schema.enum.includes("high") && /(down|outage|breach|enterprise|risky|migration|drop table)/i.test(content)) return "high";
    return schema.enum.at(-1);
  }
  if (schema.type === "object" && schema.properties) {
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(schema.properties)) {
      if (s.type === "object" || s.enum || s.type === "array") out[k] = fill(s, content);
      else {
        const v = findValue(content, k, s.type);
        if (v !== undefined) out[k] = v;
        else if (k === "confidence") out[k] = 0.9;
        else if (k === "reason") out[k] = "Matched keywords in the content (test double)";
        else if (k === "fit" || k === "score" || k === "icp_fit") out[k] = /enterprise|employees:\s*[5-9]\d{2,}|\d{4,}/i.test(content) ? 0.9 : 0.4;
        else if (k === "risky") out[k] = /migration|drop table|secret|password/i.test(content);
        else if (k === "summary") out[k] = `Summary: ${content.replace(/\s+/g, " ").slice(0, 160)}`;
        else if ((schema.required ?? []).includes(k)) out[k] = s.type === "number" || s.type === "integer" ? 0 : s.type === "boolean" ? false : "unknown";
      }
    }
    return out;
  }
  if (schema.type === "array") return [];
  return null;
}

function handleChat(reqBody: string, res: ServerResponse) {
  const r = JSON.parse(reqBody) as { model: string; format?: Schema; messages: { role: string; content: string }[] };
  const user = r.messages.find((m) => m.role === "user")?.content ?? "";
  const content = user.replace(/<\/?untrusted_content>/g, "");
  state.requests.push({ at: new Date().toISOString(), model: r.model, hasSchema: Boolean(r.format), content: content.slice(0, 2000) });
  const fault = state.faults.find((f) => f.times > 0);
  if (fault) {
    fault.times--;
    if (fault.mode === "timeout") return; // never respond
    if (fault.mode === "500") {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "injected failure" }));
      return;
    }
    if (fault.mode === "bad_json") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ model: r.model, message: { role: "assistant", content: "not json at all" }, prompt_eval_count: 10, eval_count: 3 }));
      return;
    }
  }
  const out = r.format ? JSON.stringify(fill(r.format, content)) : `Summary: ${content.replace(/\s+/g, " ").trim().slice(0, 200)}`;
  const system = r.messages.find((m) => m.role === "system")?.content ?? "";
  res.writeHead(200, { "content-type": "application/json" }).end(
    JSON.stringify({
      model: r.model,
      message: { role: "assistant", content: out },
      done: true,
      prompt_eval_count: Math.ceil((system.length + user.length) / 4),
      eval_count: Math.ceil(out.length / 4),
    }),
  );
}

export async function startFakeAi(port = 0): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    const b = await body(req);
    if (req.url === "/api/chat" && req.method === "POST") return handleChat(b, res);
    if (req.url === "/api/tags") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ models: [{ name: "fake-model" }] }));
    if (req.url === "/__fake/reset" && req.method === "POST") {
      state.requests = [];
      state.faults = [];
      return res.writeHead(200).end("{}");
    }
    if (req.url === "/__fake/fault" && req.method === "POST") {
      state.faults.push(JSON.parse(b) as Fault);
      return res.writeHead(200).end("{}");
    }
    if (req.url === "/__fake/requests") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(state.requests));
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const p = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${p}`, port: p, close: () => new Promise((r) => server.close(() => r())) };
}

if (process.argv[1]?.includes("ai-server")) {
  const port = Number(process.argv[process.argv.indexOf("--port") + 1] || 4011);
  void startFakeAi(port).then((s) => console.log(`[fake-ai] listening on ${s.url}`));
}
