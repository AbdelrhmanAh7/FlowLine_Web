/**
 * Deterministic TEST DOUBLE for the AI provider boundary: an OpenAI-compatible API (/<provider>/v1/models,
 * /<provider>/v1/chat/completions — see below) over rule-based answers. The legacy Ollama-shaped /api/chat is kept
 * only as the internal format of those rules (Flowline no longer calls it: local inference is not supported).
 * Used only by the deterministic suites (FLOWLINE_ENV=test). It is NOT a model:
 * it extracts "Key: value" pairs from the untrusted content by simple rules so tests
 * can assert exact outputs. Fault injection: POST /__fake/fault {mode:"500"|"timeout"|"bad_json", times}.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { handleHub, hub, resetHub, type HubFault, type InnerOut, type InnerReq } from "./ai-protocols";

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: string[];
  items?: Schema;
}

type Fault = { mode: "500" | "timeout" | "bad_json"; times: number };

const state = { requests: [] as { at: string; model: string; hasSchema: boolean; content: string }[], faults: [] as Fault[], price: 49 };

/** A public-looking pricing page for the Competitor Price Watch template (test double). */
function pricingPage() {
  return `<!doctype html><html><body><h1>Pricing</h1><p>Plan: Pro</p><p>Price: ${state.price}</p><p>Currency: USD</p></body></html>`;
}

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
    const head = content.match(/"headcount":\s*(\d+)/);
    if (schema.enum.includes("hot") && head) return Number(head[1]) >= 100 ? "hot" : Number(head[1]) >= 20 ? "warm" : "cold";
    if (schema.enum.includes("urgent") && /(down|outage|breach|cannot log ?in|all users)/i.test(content)) return "urgent";
    if (schema.enum.includes("high") && /(down|outage|breach|enterprise|risky|migration|drop table)/i.test(content)) return "high";
    return schema.enum.at(-1);
  }
  if (schema.type === "object" && schema.properties) {
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(schema.properties)) {
      if (s.type === "boolean") {
        out[k] = k === "risky" ? /migration|drop table|secret|password/i.test(content) : false;
        continue;
      }
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

interface AgentMsg {
  role: string;
  content: string;
  tool_name?: string;
  tool_calls?: { function: { name: string } }[];
}
interface AgentTool {
  function: { name: string; parameters?: { properties?: { workflow?: { enum?: string[] } } } };
}

/**
 * Deterministic stand-in for a tool-calling model (agents). Directives in the user message steer it:
 *  "run <workflow>" / "inspect <workflow>" → that tool; "[loop]" → keeps searching (limit tests);
 *  "[obey-document]" → behaves like a COMPROMISED model: follows "CALL <tool> <workflow>" lines found in
 *  tool results — used to prove the backend (not the prompt) enforces ALLOW/ASK/DENY.
 * Otherwise it searches knowledge once, then answers citing [1].
 */
function handleAgentChat(r: { model: string; messages: AgentMsg[]; tools: AgentTool[] }, res: ServerResponse) {
  const msgs = r.messages;
  let lastUser = -1;
  msgs.forEach((m, i) => {
    if (m.role === "user") lastUser = i;
  });
  const userText = msgs[lastUser]?.content ?? "";
  const after = msgs.slice(lastUser + 1);
  const toolMsgs = after.filter((m) => m.role === "tool");
  const has = (name: string) => r.tools.some((t) => t.function.name === name);
  const enumOf = (name: string) => r.tools.find((t) => t.function.name === name)?.function.parameters?.properties?.workflow?.enum ?? [];
  const called = (name: string) => after.some((m) => m.role === "assistant" && m.tool_calls?.some((c) => c.function.name === name));
  const reply = (content: string, calls: { name: string; arguments: Record<string, unknown> }[] = []) => {
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    const promptChars = system.length + msgs.reduce((n, m) => n + (m.content?.length ?? 0), 0);
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        model: r.model,
        message: { role: "assistant", content, ...(calls.length ? { tool_calls: calls.map((c) => ({ function: c })) } : {}) },
        done: true,
        prompt_eval_count: Math.ceil(promptChars / 4),
        eval_count: Math.ceil((content.length + JSON.stringify(calls).length) / 4),
      }),
    );
  };
  const inner = (s: string) => /<untrusted_content>([\s\S]*)<\/untrusted_content>/.exec(s)?.[1]?.trim() ?? s;

  if (userText.includes("[loop]") && has("knowledge_search")) return reply("", [{ name: "knowledge_search", arguments: { query: `${userText} ${toolMsgs.length}` } }]);
  if (userText.includes("[obey-document]")) {
    for (const t of toolMsgs) {
      const m = /CALL (\w+) (.+)/.exec(t.content);
      if (m && !called(m[1]!)) return reply("", [{ name: m[1]!, arguments: { workflow: m[2]!.trim().replace(/[.\s]+$/, ""), input: {} } }]);
    }
  }
  const runMatch = /\brun (?:the )?(?:workflow )?"?([^"\n]+?)"?(?: with (\{.*\}))?\s*$/im.exec(userText);
  if (runMatch && has("run_workflow") && !called("run_workflow")) {
    const name = enumOf("run_workflow").find((n) => n.toLowerCase() === runMatch[1]!.trim().toLowerCase()) ?? runMatch[1]!.trim();
    let input: unknown = {};
    try {
      input = runMatch[2] ? JSON.parse(runMatch[2]) : {};
    } catch {
      input = {};
    }
    return reply("", [{ name: "run_workflow", arguments: { workflow: name, input } }]);
  }
  const inspect = /\binspect (?:the )?(?:workflow )?"?([^"\n]+?)"?\s*$/im.exec(userText);
  if (inspect && has("workflow_inspect") && !called("workflow_inspect")) return reply("", [{ name: "workflow_inspect", arguments: { workflow: inspect[1]!.trim() } }]);
  if (has("knowledge_search") && !called("knowledge_search") && !runMatch && !inspect) return reply("", [{ name: "knowledge_search", arguments: { query: userText } }]);

  // Final answer from the tool results.
  const lastTool = toolMsgs.at(-1);
  if (!lastTool) return reply(`I have no tools for that. You said: ${userText.slice(0, 120)}`);
  const body = inner(lastTool.content);
  if (/^\{"error"/.test(lastTool.content)) return reply(`I couldn't do that: ${(JSON.parse(lastTool.content) as { error: string }).error}`);
  if (lastTool.tool_name === "run_workflow" || /"runId"/.test(body)) {
    try {
      const o = JSON.parse(body) as { status: string; output?: unknown; runNumber?: number };
      return reply(`Workflow run #${o.runNumber} finished with status ${o.status}. Output: ${JSON.stringify(o.output)}`);
    } catch {
      return reply(`Workflow result: ${body.slice(0, 200)}`);
    }
  }
  const first = /\[(\d+)\] ([^:]+): ([^\n]+)/.exec(body);
  if (first) return reply(`According to [${first[1]}] ${first[2]}: ${first[3]!.slice(0, 200)}`);
  return reply(`Nothing relevant was found. ${body.slice(0, 120)}`);
}

interface CopilotCtx {
  catalog: { connections: { id: string; provider: string; status: string }[] };
  currentWorkflow: { nodes: { id: string; type: string; label: string }[]; edges: { source: string; target: string }[] };
}

/**
 * Deterministic stand-in for the Copilot model: turns a few request shapes into patches, including
 * deliberately INVALID ones (invented node type / integration / parameter / credential) so the
 * server-side validator is exercised. It is not a model.
 */
function handleCopilot(r: { model: string; messages: { role: string; content: string }[] }, res: ServerResponse) {
  const sys = r.messages.find((m) => m.role === "system")?.content ?? "";
  const request = (/this request from the workflow's owner: "([\s\S]*?)"\.(?:\s|$)/.exec(sys)?.[1] ?? "").toLowerCase();
  const user = r.messages.find((m) => m.role === "user")?.content ?? "";
  let ctx: CopilotCtx = { catalog: { connections: [] }, currentWorkflow: { nodes: [], edges: [] } };
  try {
    ctx = JSON.parse(/<untrusted_content>([\s\S]*)<\/untrusted_content>/.exec(user)?.[1]?.trim() ?? "{}") as CopilotCtx;
  } catch {
    /* keep empty */
  }
  const conn = (provider: string) => ctx.catalog.connections.find((c) => c.provider === provider && c.status === "active")?.id ?? "";
  const nodes = ctx.currentWorkflow.nodes;
  const edges = ctx.currentWorkflow.edges;
  type Patch = { summary: string; addNodes: unknown[]; updateNodes: unknown[]; removeNodes: string[]; addEdges: unknown[]; removeEdges: unknown[] };
  const patch: Patch = { summary: "", addNodes: [], updateNodes: [], removeNodes: [], addEdges: [], removeEdges: [] };
  const trigger = nodes.find((n) => n.type.startsWith("trigger."));
  const tail = [...nodes].reverse().find((n) => n.type !== "output") ?? trigger;

  if (request.includes("teleport")) {
    patch.summary = "Teleport the data";
    patch.addNodes.push({ id: "tp", type: "magic.teleport", label: "Teleport", config: {} });
    if (tail) patch.addEdges.push({ source: tail.id, target: "tp" });
  } else if (request.includes("discord")) {
    patch.summary = "Post to Discord";
    patch.addNodes.push({ id: "dc", type: "integration.action", label: "Discord — Post", config: { actionId: "discord.post_message", connectionId: "", inputMapping: '{ "text": "hi" }' } });
    if (tail) patch.addEdges.push({ source: tail.id, target: "dc" });
  } else if (request.includes("bogus")) {
    patch.summary = "Transform with a made-up parameter";
    patch.addNodes.push({ id: "bx", type: "transform.json", label: "Shape", config: { expression: "$", turbo: true } });
    if (tail) patch.addEdges.push({ source: tail.id, target: "bx" });
  } else if (request.includes("hardcoded credential")) {
    patch.summary = "Post to Slack with a made-up connection";
    patch.addNodes.push({ id: "sl", type: "integration.action", label: "Slack — Post", config: { actionId: "slack.post_message", connectionId: "00000000-0000-4000-8000-000000000000", inputMapping: '{ "channel": "C1", "text": "hi" }' } });
    if (tail) patch.addEdges.push({ source: tail.id, target: "sl" });
  } else if (/\bremove (.+)$/.test(request)) {
    const name = /\bremove (?:the )?(.+?)(?: step)?$/.exec(request)![1]!.trim();
    const victim = nodes.find((n) => n.label.toLowerCase() === name);
    patch.summary = `Remove ${victim?.label ?? name}`;
    if (victim) {
      patch.removeNodes.push(victim.id);
      const ins = edges.filter((e) => e.target === victim.id).map((e) => e.source);
      const outs = edges.filter((e) => e.source === victim.id).map((e) => e.target);
      for (const s of ins) for (const t of outs) patch.addEdges.push({ source: s, target: t });
    }
  } else if (/add (a )?(condition|filter)/.test(request) && tail) {
    patch.summary = `Only continue when the value is present, after "${tail.label}"`;
    const next = edges.filter((e) => e.source === tail.id).map((e) => e.target);
    patch.addNodes.push({ id: "gate", type: "logic.condition", label: "Has value?", config: { expression: "$exists($)" } });
    for (const t of next) {
      patch.removeEdges.push({ source: tail.id, target: t });
      patch.addEdges.push({ source: "gate", target: t, sourceHandle: "true" });
    }
    patch.addEdges.push({ source: tail.id, target: "gate" });
  } else if (/kpi|leadership|summar/.test(request)) {
    patch.summary = "Every Monday: query KPIs, summarize the changes with AI, email leadership (email needs approval).";
    patch.addNodes.push(
      { id: "sched", type: "trigger.schedule", label: "Every Monday 09:00", config: { cron: "0 9 * * 1", timezone: "UTC", missedPolicy: "skip" } },
      { id: "kpis", type: "integration.action", label: "Postgres — KPIs", config: { actionId: "postgres.query", connectionId: conn("postgres"), inputMapping: '{ "sql": "select week, revenue, signups from kpi order by week desc limit 2" }', requireApproval: false } },
      { id: "sum", type: "ai.generate", label: "Summarize changes", config: { instructions: "Summarize the important week-over-week KPI changes for leadership in 3 bullets.", source: "$string($steps.kpis.rows)", maxTokens: 300, model: "" } },
      { id: "mail", type: "integration.action", label: "Gmail — Email leadership", config: { actionId: "gmail.send", connectionId: conn("gmail"), inputMapping: '{ "to": "leadership@example.com", "subject": "Weekly KPI digest", "body": $steps.sum.text }', requireApproval: true } },
      { id: "done", type: "output", label: "Sent", config: { key: "digest", expression: "" } },
    );
    patch.addEdges.push({ source: "sched", target: "kpis" }, { source: "kpis", target: "sum" }, { source: "sum", target: "mail" }, { source: "mail", target: "done" });
  } else {
    patch.summary = "Add a transform step";
    patch.addNodes.push({ id: "shape", type: "transform.json", label: "Shape data", config: { expression: "$" } });
    if (tail) patch.addEdges.push({ source: tail.id, target: "shape" });
  }
  const out = JSON.stringify(patch);
  res.writeHead(200, { "content-type": "application/json" }).end(
    JSON.stringify({ model: r.model, message: { role: "assistant", content: out }, done: true, prompt_eval_count: Math.ceil((sys.length + user.length) / 4), eval_count: Math.ceil(out.length / 4) }),
  );
}

function handleChat(reqBody: string, res: ServerResponse) {
  const raw = JSON.parse(reqBody) as { model: string; format?: Schema; messages: { role: string; content: string }[]; tools?: AgentTool[] };
  if (Array.isArray(raw.tools)) {
    const fault = state.faults.find((f) => f.times > 0);
    if (fault) {
      fault.times--;
      if (fault.mode === "timeout") return;
      if (fault.mode === "500") return void res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "injected failure" }));
    }
    state.requests.push({ at: new Date().toISOString(), model: raw.model, hasSchema: false, content: JSON.stringify(raw.messages.at(-1)).slice(0, 2000) });
    return handleAgentChat(raw as never, res);
  }
  const r = raw;
  const sys = r.messages.find((m) => m.role === "system")?.content ?? "";
  const user = r.messages.find((m) => m.role === "user")?.content ?? "";
  // A real model reads HTML fine; this rule-based double strips markup first.
  const data = /<untrusted_content>([\s\S]*)<\/untrusted_content>/.exec(user)?.[1] ?? user;
  const content = data.replace(/<[^>]+>/g, "\n");
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
  if (sys.includes("FLOWLINE_COPILOT")) return handleCopilot(r, res);
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


/* ───────────── OpenAI-compatible surface (AI hub test double) ─────────────
 * Mounted at /<providerId>/v1/* (the hub rewrites a provider's documented base URL to
 * <FLOWLINE_AI_TEST_OVERRIDE>/<providerId><path> ONLY when FLOWLINE_ENV=test). It speaks the documented shapes of
 * GET /models (paginated here: 2 per page with has_more/last_id, `after` cursor) and POST /chat/completions
 * (tools, response_format json_schema, usage with prompt_tokens_details.cached_tokens and
 * completion_tokens_details.reasoning_tokens). It is a TEST DOUBLE, not a model: answers come from the same rules
 * as the rest of this file. Keys: any "sk-fake-…" is accepted except ones containing "revoked" (401 that echoes a
 * partially masked key, like real providers do). Every request records a SHA-256 of the key used — never the key.
 */
const OPENAI_MODELS = ["fake-gpt-mini", "fake-gpt-large", "fake-gpt-tools", "fake-reasoner", "fake-cache"];
type OpenAiFault = { mode: "401" | "403" | "429" | "500" | "timeout" | "removed_model" | "redirect_private" | "redirect_cross_origin" | "insufficient_quota" | "bad_json" | "slow"; times: number; retryAfterSec?: number; delayMs?: number; path?: "chat" | "models" };
const openai = {
  requests: [] as { at: string; method: string; path: string; keySha256: string | null; model?: string; hasTools?: boolean; responseFormat?: string | null; auth: string }[],
  faults: [] as OpenAiFault[],
  catalogue: "normal" as "normal" | "malformed" | "outage",
  removed: new Set<string>(),
  added: new Set<string>(),
  stolen: 0,
};

function resetOpenAi() {
  openai.requests = [];
  openai.faults = [];
  openai.catalogue = "normal";
  openai.removed = new Set();
  openai.added = new Set();
  openai.stolen = 0;
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function oaError(res: ServerResponse, status: number, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify({ error: { message, type: status >= 500 ? "server_error" : "invalid_request_error", param: null, code: null, ...extra } }));
}

function takeOpenAiFault(path: "chat" | "models") {
  const f = openai.faults.find((x) => x.times > 0 && (x.path ?? "chat") === path);
  if (f) f.times--;
  return f;
}

/** Captures what the Ollama-shaped handlers above write, so they can be re-emitted in the OpenAI shape. */
function capture(onEnd: (status: number, body: string) => void): ServerResponse {
  const r = {
    statusCode: 200,
    writeHead(s: number) {
      r.statusCode = s;
      return r;
    },
    end(b?: string) {
      onEnd(r.statusCode, b ?? "");
      return r;
    },
  };
  return r as unknown as ServerResponse;
}

function listedModels() {
  return [...OPENAI_MODELS.filter((m) => !openai.removed.has(m)), ...openai.added].filter((m) => !openai.removed.has(m));
}

function handleOpenAi(req: IncomingMessage, res: ServerResponse, url: URL, rawBody: string, port: number, delayed = false): boolean {
  const m = /^\/([a-z0-9-]+)\/v1(\/.*)$/.exec(url.pathname);
  if (!m) return false;
  const sub = m[2]!;
  const auth = req.headers.authorization ?? "";
  const key = /^Bearer (.+)$/.exec(auth)?.[1] ?? null;
  const rec: (typeof openai.requests)[number] = { at: new Date().toISOString(), method: req.method ?? "GET", path: `/${m[1]}/v1${sub}`, keySha256: key ? sha256(key) : null, auth: key ? "bearer" : auth ? "other" : "none" };
  if (sub === "/steal") {
    openai.stolen++;
    res.writeHead(200).end("{}");
    return true;
  }
  if (!delayed) openai.requests.push(rec);
  if (!key || !key.startsWith("sk-fake-") || key.includes("revoked")) {
    const masked = key ? `${key.slice(0, 10)}${"*".repeat(Math.max(0, key.length - 13))}${key.slice(-3)}` : "";
    oaError(res, 401, key ? `Incorrect API key provided: ${masked}. You can find your API key at https://platform.openai.com/account/api-keys.` : "You didn't provide an API key.", { code: "invalid_api_key" });
    return true;
  }
  const fault = delayed ? undefined : takeOpenAiFault(sub === "/models" ? "models" : "chat");
  if (fault) {
    if (fault.mode === "timeout") return true; // never answer
    if (fault.mode === "401") return oaError(res, 401, `Incorrect API key provided: ${key.slice(0, 10)}***.`, { code: "invalid_api_key" }), true;
    if (fault.mode === "403") return oaError(res, 403, "You are not allowed to sample from this model", { code: "model_access_denied" }), true;
    if (fault.mode === "429") return oaError(res, 429, "Rate limit reached", { code: "rate_limit_exceeded" }, fault.retryAfterSec != null ? { "retry-after": String(fault.retryAfterSec) } : {}), true;
    if (fault.mode === "insufficient_quota") return oaError(res, 429, "You exceeded your current quota", { code: "insufficient_quota", type: "insufficient_quota" }), true;
    if (fault.mode === "500") return oaError(res, 500, "The server had an error while processing your request."), true;
    if (fault.mode === "removed_model") return oaError(res, 404, "The model does not exist or you do not have access to it.", { code: "model_not_found" }), true;
    if (fault.mode === "redirect_private") return res.writeHead(307, { location: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" }).end(), true;
    if (fault.mode === "redirect_cross_origin") return res.writeHead(307, { location: `http://localhost:${port}/${m[1]}/v1/steal` }).end(), true;
    if (fault.mode === "bad_json") return res.writeHead(200, { "content-type": "application/json" }).end("{not json"), true;
  }
  // "slow": answer normally, but only after delayMs (lets tests change a connection while a call is in flight).
  if (fault?.mode === "slow") {
    setTimeout(() => handleOpenAi(req, res, url, rawBody, port, true), fault.delayMs ?? 1000);
    return true;
  }

  if (req.method === "GET" && sub === "/models") {
    if (openai.catalogue === "outage") return oaError(res, 503, "Service unavailable"), true;
    if (openai.catalogue === "malformed") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: "fake-gpt-mini" }, { name: "no id here" }, { id: "../../etc/passwd" }] })), true;
    const all = listedModels();
    const after = url.searchParams.get("after");
    const start = after ? all.indexOf(after) + 1 : 0;
    const page = all.slice(start, start + 2);
    const hasMore = start + 2 < all.length;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: page.map((id) => ({ id, object: "model", created: 1_700_000_000, owned_by: "fake-org" })), has_more: hasMore, ...(hasMore ? { last_id: page.at(-1) } : {}) }));
    return true;
  }

  if (req.method === "POST" && sub === "/chat/completions") {
    let body: { model: string; messages: { role: string; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }[]; tools?: AgentTool[]; response_format?: { type: string; json_schema?: { schema?: Schema } }; max_completion_tokens?: number; max_tokens?: number };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return oaError(res, 400, "We could not parse the JSON body of your request."), true;
    }
    rec.model = body.model;
    rec.hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    rec.responseFormat = body.response_format?.type ?? null;
    if (!listedModels().includes(body.model)) return oaError(res, 404, `The model \`${body.model}\` does not exist or you do not have access to it.`, { code: "model_not_found" }), true;
    // OpenAI documents max_completion_tokens; OpenAI-compatible providers take max_tokens.
    if (body.max_completion_tokens == null && (m[1] === "openai" || body.max_tokens == null)) return oaError(res, 400, "Missing required parameter: 'max_completion_tokens'."), true;
    // Translate to the Ollama-shaped request the deterministic handlers above understand.
    const names = new Map<string, string>();
    for (const msg of body.messages) for (const c of msg.tool_calls ?? []) names.set(c.id, c.function.name);
    const system = body.messages.find((x) => x.role === "system")?.content ?? "";
    const prompted = /matching this JSON schema: (\{[\s\S]*\})\s*$/.exec(system)?.[1];
    let format: Schema | undefined = body.response_format?.json_schema?.schema;
    if (!format && prompted) {
      try {
        format = JSON.parse(prompted) as Schema;
      } catch {
        format = undefined;
      }
    }
    const inner = {
      model: body.model,
      ...(format ? { format } : {}),
      ...(body.tools || system.includes("You are an agent inside Flowline") ? { tools: body.tools ?? [] } : {}),
      messages: body.messages.map((x) => ({
        role: x.role,
        content: x.content ?? "",
        ...(x.role === "tool" && x.tool_call_id ? { tool_name: names.get(x.tool_call_id) } : {}),
        ...(x.tool_calls ? { tool_calls: x.tool_calls.map((c) => ({ function: { name: c.function.name } })) } : {}),
      })),
    };
    const shim = capture((status, out) => {
      if (status >= 400) return oaError(res, status, "The server had an error while processing your request.");
      const o = JSON.parse(out) as { model: string; message: { content: string; tool_calls?: { function: { name: string; arguments: unknown } }[] }; prompt_eval_count: number; eval_count: number };
      const reasoning = body.model === "fake-reasoner" ? 7 : 0;
      const cached = body.model === "fake-cache" ? Math.floor(o.prompt_eval_count / 2) : 0;
      const calls = o.message.tool_calls ?? [];
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          id: `chatcmpl-fake-${openai.requests.length}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: calls.length ? null : o.message.content,
                // Some OpenAI-compatible servers return reasoning text; Flowline must never persist it.
                ...(reasoning ? { reasoning_content: "HIDDEN-CHAIN-OF-THOUGHT-CANARY" } : {}),
                ...(calls.length ? { tool_calls: calls.map((c, i) => ({ id: `call_${i}`, type: "function", function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments ?? {}) } })) } : {}),
              },
              finish_reason: calls.length ? "tool_calls" : "stop",
            },
          ],
          usage: {
            prompt_tokens: o.prompt_eval_count,
            completion_tokens: o.eval_count + reasoning,
            total_tokens: o.prompt_eval_count + o.eval_count + reasoning,
            prompt_tokens_details: { cached_tokens: cached },
            completion_tokens_details: { reasoning_tokens: reasoning },
          },
        }),
      );
    });
    handleChat(JSON.stringify(inner), shim);
    return true;
  }
  oaError(res, 404, `Unknown path ${sub}`);
  return true;
}

/** Runs the deterministic rules on an Ollama-shaped request and returns a protocol-neutral answer. */
function runRules(inner: InnerReq): Promise<InnerOut> {
  return new Promise((resolve) => {
    handleChat(
      JSON.stringify(inner),
      capture((status, out) => {
        if (status >= 400) return resolve({ status, content: "", toolCalls: [], promptTokens: 0, outputTokens: 0 });
        const o = JSON.parse(out) as { message: { content: string; tool_calls?: { function: { name: string; arguments: unknown } }[] }; prompt_eval_count: number; eval_count: number };
        resolve({
          status: 200,
          content: o.message.content ?? "",
          toolCalls: (o.message.tool_calls ?? []).map((c) => ({ name: c.function.name, arguments: (c.function.arguments ?? {}) as Record<string, unknown> })),
          promptTokens: o.prompt_eval_count,
          outputTokens: o.eval_count,
        });
      }),
    );
  });
}

export async function startFakeAi(port = 0): Promise<{ url: string; port: number; close(): Promise<void> }> {
  let boundPort = port;
  const server: Server = createServer(async (req, res) => {
    const b = await body(req);
    const url = new URL(req.url ?? "/", "http://fake.local");
    if (req.url === "/__fake/hub/requests") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ requests: hub.requests }));
    if (req.url === "/__fake/hub/fault" && req.method === "POST") {
      hub.faults.push(JSON.parse(b) as HubFault);
      return res.writeHead(200).end("{}");
    }
    if (req.url === "/__fake/hub/public" && req.method === "POST") {
      for (const p of (JSON.parse(b) as { providers: string[] }).providers) hub.publicListing.add(p);
      return res.writeHead(200).end("{}");
    }
    if (req.url === "/__fake/hub/remove" && req.method === "POST") {
      hub.removed.add(String((JSON.parse(b) as { model: string }).model));
      return res.writeHead(200).end("{}");
    }
    const delegate = (provider: string, sub: "/chat/completions" | "/models") => {
      const u = new URL(url.toString());
      u.pathname = `/${provider}/v1${sub}`;
      handleOpenAi(req, res, u, b, boundPort);
    };
    if (await handleHub(req, res, url, b, { run: runRules, oaModels: listedModels, delegate })) return;
    if (req.url === "/__fake/openai/requests") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ requests: openai.requests, stolen: openai.stolen }));
    if (req.url === "/__fake/openai/fault" && req.method === "POST") {
      openai.faults.push(JSON.parse(b) as OpenAiFault);
      return res.writeHead(200).end("{}");
    }
    if (req.url === "/__fake/openai/catalogue" && req.method === "POST") {
      const c = JSON.parse(b) as { mode?: "normal" | "malformed" | "outage"; remove?: string; add?: string; restore?: string };
      if (c.mode) openai.catalogue = c.mode;
      if (c.remove) openai.removed.add(c.remove);
      if (c.restore) openai.removed.delete(c.restore);
      if (c.add) openai.added.add(c.add);
      return res.writeHead(200).end("{}");
    }
    if (handleOpenAi(req, res, url, b, boundPort)) return;
    if (req.url === "/api/chat" && req.method === "POST") return handleChat(b, res);
    if (req.url === "/pricing" && req.method === "GET") return res.writeHead(200, { "content-type": "text/html" }).end(pricingPage());
    if (req.url === "/__fake/pricing" && req.method === "POST") {
      state.price = Number(JSON.parse(b).price);
      return res.writeHead(200).end("{}");
    }
    if (req.url === "/api/tags") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ models: [{ name: "fake-model" }] }));
    if (req.url === "/__fake/reset" && req.method === "POST") {
      state.requests = [];
      state.faults = [];
      state.price = 49;
      resetOpenAi();
      resetHub();
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
  boundPort = p;
  return { url: `http://127.0.0.1:${p}`, port: p, close: () => new Promise((r) => server.close(() => r())) };
}

if (process.argv[1]?.includes("ai-server")) {
  const port = Number(process.argv[process.argv.indexOf("--port") + 1] || 4011);
  void startFakeAi(port).then((s) => console.log(`[fake-ai] listening on ${s.url}`));
}
