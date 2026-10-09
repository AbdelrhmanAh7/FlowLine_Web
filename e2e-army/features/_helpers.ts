// Shared helpers for the FlowLine_Web feature suite (NOT a test file: no .e2e.ts suffix, so featurecov and `e2e run` ignore it).
//
// Conventions
//  - Every test is independent: it asks for the actor (verified user + workspace) it needs; `actor(name)` creates it on first use and
//    re-uses it afterwards (cookie jar cached in the OS temp dir, keyed by the stack URL, so a re-run on a NEW stack never sees stale data).
//  - Data is deterministic: names/emails come from seeded() (lib.ts); the only clock value is the SERVER's own `Date` header (webhook
//    signatures and the schedule test need "now"; the test host never invents a timestamp).
//  - HTTP is plain fetch (Node 22) with a tiny cookie jar. The product's CSRF rule (state-changing request + cookie => Origin must be the app's)
//    is satisfied by always sending `origin`; Bearer-only calls (API keys) send no cookie at all.
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "e2e";
import { apiBase, seeded, seededEmail } from "../lib.ts";

export const PASSWORD = "Army-Passw0rd!";
export const SEED_DOMAIN = "flowline-e2e.test";

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface R<T = any> { status: number; ok: boolean; headers: Headers; text: string; json: T }
export interface CallInit { json?: unknown; body?: BodyInit; headers?: Record<string, string>; redirect?: RequestRedirect; noCookies?: boolean }

export class Http {
  readonly jar = new Map<string, string>();
  readonly base: string;
  /** Cookies that are not part of a session: the test-only open-beta switch and the English UI. */
  readonly fixed: Record<string, string>;
  constructor(base: string = apiBase(), fixed: Record<string, string> = { fl_test_beta_mode: "open", fl_locale: "en" }) {
    this.base = base;
    this.fixed = fixed;
  }
  cookieHeader() {
    return [...Object.entries(this.fixed), ...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  cookies(): Record<string, string> { return Object.fromEntries(this.jar); }
  async call(method: string, path: string, init: CallInit = {}): Promise<R> {
    const headers: Record<string, string> = { origin: new URL(this.base).origin, ...(init.headers ?? {}) };
    const ck = init.noCookies ? "" : this.cookieHeader();
    if (ck) headers.cookie = ck;
    let body: BodyInit | undefined = init.body;
    if (init.json !== undefined) { body = JSON.stringify(init.json); headers["content-type"] = "application/json"; }
    const res = await fetch(`${this.base}${path}`, { method, headers, body, redirect: init.redirect ?? "manual" });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim(), value = pair.slice(eq + 1).trim();
      const gone = attrs.some((a) => /^\s*max-age=0/i.test(a)) || value === "";
      if (gone) this.jar.delete(name); else this.jar.set(name, value);
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, ok: res.ok, headers: res.headers, text, json };
  }
  get(path: string, init: CallInit = {}) { return this.call("GET", path, init); }
  post(path: string, init: CallInit = {}) { return this.call("POST", path, init); }
  put(path: string, init: CallInit = {}) { return this.call("PUT", path, init); }
  patch(path: string, init: CallInit = {}) { return this.call("PATCH", path, init); }
  del(path: string, init: CallInit = {}) { return this.call("DELETE", path, init); }
}

/** A client with no session and no cookies at all (API-key and webhook callers). */
export const anonymous = () => new Http(apiBase(), {});
/** A client that sends only a Bearer API key. */
export function withKey(key: string) {
  const h = new Http(apiBase(), {});
  const call = h.call.bind(h);
  h.call = (m, p, i = {}) => call(m, p, { ...i, noCookies: true, headers: { authorization: `Bearer ${key}`, ...(i.headers ?? {}) } });
  return h;
}

/** The server's own clock (HTTP `Date` header of a cheap endpoint), so signatures and cron minutes never depend on this host's clock. */
export async function serverNow(): Promise<Date> {
  const r = await anonymous().get("/api/health");
  const d = r.headers.get("date");
  if (!d) throw new Error("the server sent no Date header");
  return new Date(d);
}

// ── accounts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface OutboxMessage { subject: string; text: string; purpose: string | null; link: string | null; createdAt: string }
export async function outbox(h: Http, email: string, purpose?: string): Promise<OutboxMessage[]> {
  const r = await h.get(`/api/test/outbox?email=${encodeURIComponent(email)}`);
  const all: OutboxMessage[] = r.json?.messages ?? [];
  return purpose ? all.filter((m) => m.purpose === purpose) : all;
}
/** Waits for the e-mail with `purpose` to `email` (more than `before` of them) and returns the newest. */
export async function awaitMail(h: Http, email: string, purpose: string, before = 0): Promise<OutboxMessage> {
  await expect.poll(async () => (await outbox(h, email, purpose)).length, { timeout: 20_000, message: `no "${purpose}" mail for ${email}` }).toBeGreaterThan(before);
  return (await outbox(h, email, purpose))[0]!;
}
export const tokenOf = (link: string | null) => (link ? new URL(link).searchParams.get("token") : null);

/** Sign-up -> mail -> verify link, all through the product's own API. Leaves no session. */
export async function signUpVerified(email: string, name = "Army Bot", password = PASSWORD) {
  const h = new Http();
  const up = await h.post("/api/auth/sign-up/email", { json: { email, password, name } });
  if (!up.ok) throw new Error(`sign-up ${up.status}: ${up.text.slice(0, 200)}`);
  const mail = await awaitMail(h, email, "verify");
  const v = await h.post("/api/email", { json: { action: "verify", token: tokenOf(mail.link) } });
  if (v.json?.status !== "done") throw new Error(`verify failed: ${v.text.slice(0, 200)}`);
}
export async function signIn(email: string, password = PASSWORD): Promise<Http> {
  const h = new Http();
  const r = await h.post("/api/auth/sign-in/email", { json: { email, password } });
  if (!r.ok) throw new Error(`sign-in ${r.status}: ${r.text.slice(0, 200)}`);
  return h;
}

export interface Actor { name: string; email: string; userId: string; workspaceId: string; slug: string; workspaceName: string; cookies: Record<string, string> }
const stackDir = () => {
  const d = join(tmpdir(), `fl-army-${createHash("sha1").update(apiBase()).digest("hex").slice(0, 10)}`);
  mkdirSync(d, { recursive: true });
  return d;
};
export const clientOf = (a: Actor) => { const h = new Http(); for (const [k, v] of Object.entries(a.cookies)) h.jar.set(k, v); return h; };

/**
 * A verified, signed-in user who owns one workspace (onboarding done). First use creates it through the API, later uses re-load the
 * saved cookies (and re-create everything when they no longer work, e.g. a different stack).
 */
export async function actor(name: string): Promise<{ a: Actor; http: Http }> {
  const file = join(stackDir(), `actor-${name}.json`);
  if (existsSync(file)) {
    try {
      const a = JSON.parse(readFileSync(file, "utf8")) as Actor;
      const http = clientOf(a);
      const me = await http.get("/api/me");
      if (me.status === 200 && me.json?.user?.email === a.email) return { a, http };
    } catch { /* recreate */ }
  }
  const email = seededEmail(`fl-${name}`, SEED_DOMAIN);
  let http: Http | null = null;
  try { http = await signIn(email); } catch { /* new account */ }
  if (!http) { await signUpVerified(email, `Army ${name}`); http = await signIn(email); }
  const me = (await http.get("/api/me")).json;
  const wsName = `Army ${seeded(name, 4)}`;
  let ws = (me.workspaces as any[])[0];
  if (!ws) {
    const created = await http.post("/api/workspaces", { json: { name: wsName } });
    if (created.status !== 201) throw new Error(`workspace ${created.status}: ${created.text.slice(0, 200)}`);
    ws = created.json.workspace;
  }
  await http.post("/api/onboarding", { json: { goal: "sales", skipped: false } });
  const a: Actor = { name, email, userId: me.user.id, workspaceId: ws.id, slug: ws.slug, workspaceName: ws.name, cookies: http.cookies() };
  writeFileSync(file, JSON.stringify(a));
  return { a, http };
}

/** Adds the actor `memberName` to `owner`'s workspace with `role` (invite -> accept) and returns the member's own client. */
export async function addMember(owner: { a: Actor; http: Http }, memberName: string, role: "owner" | "editor" | "viewer") {
  const m = await actor(memberName);
  const inv = await owner.http.post(`/api/workspaces/${owner.a.workspaceId}/invites`, { json: { email: m.a.email, role } });
  if (inv.status === 201) {
    const token = String(inv.json.url).split("/invite/")[1]!;
    const acc = await m.http.post(`/api/invites/${token}`);
    if (!acc.ok) throw new Error(`accept ${acc.status}: ${acc.text.slice(0, 200)}`);
  } else if (inv.status !== 409) throw new Error(`invite ${inv.status}: ${inv.text.slice(0, 200)}`);
  const list = (await owner.http.get(`/api/workspaces/${owner.a.workspaceId}/members`)).json.members as { userId: string; role: string }[];
  const mine = list.find((x) => x.userId === m.a.userId);
  if (mine && mine.role !== role) await owner.http.patch(`/api/workspaces/${owner.a.workspaceId}/members/${m.a.userId}`, { json: { role } });
  return m;
}

/** UI sessions: the browser gets the actor's cookies (+ English UI + open beta) so a test starts signed in without a model. */
export function browserCookies(a: Actor, locale: "en" | "ar" = "en") {
  const url = apiBase();
  return [
    ...Object.entries(a.cookies).map(([name, value]) => ({ url, name, value })),
    { url, name: "fl_locale", value: locale },
    { url, name: "fl_test_beta_mode", value: "open" },
  ];
}

// ── flows ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface GraphNode { id: string; type: string; position: { x: number; y: number }; data: { label: string; config: Record<string, unknown> } }
export interface GraphEdge { id: string; source: string; target: string; sourceHandle?: string | null }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

const node = (id: string, type: string, label: string, config: Record<string, unknown>, x: number, y = 100): GraphNode => ({ id, type, position: { x, y }, data: { label, config } });
export const N = {
  manual: (payload: unknown = {}, id = "t", label = "Start") => node(id, "trigger.manual", label, { samplePayload: JSON.stringify(payload) }, 0),
  webhook: (payload: unknown = {}, id = "t", label = "Hook", scheme?: "github") => node(id, "trigger.webhook", label, { samplePayload: JSON.stringify(payload), ...(scheme ? { signatureScheme: scheme } : {}) }, 0),
  schedule: (cron: string, id = "t", label = "Timer", timezone = "UTC", missedPolicy = "skip") => node(id, "trigger.schedule", label, { cron, timezone, missedPolicy }, 0),
  transform: (id: string, expression: string, x = 300, label = id) => node(id, "transform.json", label, { expression }, x),
  condition: (id: string, expression: string, x = 600, label = id) => node(id, "logic.condition", label, { expression }, x),
  output: (id: string, key: string, expression = "", x = 900, label = id, y = 100) => node(id, "output", label, { key, expression }, x, y),
  filter: (id: string, predicate: string, source = "$", x = 300) => node(id, "data.filter", id, { predicate, source }, x),
  map: (id: string, fields: { key: string; expression: string }[], x = 300) => node(id, "data.map", id, { fields }, x),
  merge: (id: string, mode: "object" | "array" | "first", x = 600) => node(id, "data.merge", id, { mode }, x),
  csv: (id: string, mode: "parse" | "build", source = "$", delimiter = ",", x = 300) => node(id, "data.csv", id, { mode, source, delimiter }, x),
  store: (id: string, op: "get" | "set", namespace: string, key: string, value = "", x = 300) => node(id, "data.store", id, { op, namespace, key, value }, x),
  code: (id: string, code: string, timeoutMs = 5000, x = 300) => node(id, "code.js", id, { code, timeoutMs }, x),
  http: (id: string, method: string, url: string, body = "", x = 300) => node(id, "http.request", id, { method, url, headers: "", body, timeoutMs: 10000, sideEffect: method === "GET" ? "none" : "non_idempotent" }, x),
  subflow: (id: string, flowId: string, version: number, input = "$", x = 300) => node(id, "flow.subflow", id, { flowId, version, input }, x),
  loop: (id: string, items: string, flowId: string, version: number, maxItems = 10, x = 300) => node(id, "logic.loop", id, { items, flowId, version, maxItems }, x),
  file: (id: string, from: "upload" | "input" | "url", fileId: string, as: "text" | "json" | "csv" | "pdf_text", source = "", x = 300) => node(id, "data.file", id, { from, fileId, source, as }, x),
  action: (id: string, actionId: string, connectionId: string, inputMapping: string, requireApproval = false, x = 300) => node(id, "integration.action", id, { actionId, connectionId, inputMapping, requireApproval }, x),
};
export const E = (source: string, target: string, handle: string | null = "out"): GraphEdge => ({ id: `e-${source}-${target}-${handle ?? "x"}`, source, target, sourceHandle: handle });
/** trigger -> transform -> output chain; `expression` is JSONata over the trigger payload. */
export const chain = (payload: unknown, expression: string, key = "result"): Graph => ({
  nodes: [N.manual(payload), N.transform("shape", expression), N.output("out", key)],
  edges: [E("t", "shape"), E("shape", "out")],
});

export interface FlowRow { id: string; name: string; revision: number; graph: Graph; workspaceId: string; publishedVersionId: string | null }
export async function createFlow(h: Http, workspaceId: string, body: { name?: string; templateId?: string } = {}): Promise<FlowRow> {
  const r = await h.post(`/api/workspaces/${workspaceId}/flows`, { json: body });
  if (r.status !== 201) throw new Error(`create flow ${r.status}: ${r.text.slice(0, 300)}`);
  return r.json.flow;
}
/** Create + save a graph in one go; returns the saved flow row. */
export async function newFlow(h: Http, workspaceId: string, name: string, graph: Graph, opts: { createVersion?: boolean } = {}): Promise<FlowRow> {
  const f = await createFlow(h, workspaceId, { name });
  const r = await h.put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision, graph, ...(opts.createVersion ? { createVersion: true } : {}) } });
  if (!r.ok) throw new Error(`save flow ${r.status}: ${r.text.slice(0, 400)}`);
  return r.json.flow;
}
export async function startRun(h: Http, flowId: string, input?: unknown, clientRequestId?: string): Promise<R> {
  const json: Record<string, unknown> = {};
  if (input !== undefined) json.input = input;
  if (clientRequestId) json.clientRequestId = clientRequestId;
  return h.post(`/api/flows/${flowId}/runs`, { json });
}
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
/** Polls GET /api/runs/:id until the run reaches one of `until` (default: any terminal status) and returns the run detail. */
export async function waitRun(h: Http, runId: string, until: string[] | "terminal" = "terminal", timeout = 60_000): Promise<any> {
  let last: any = null;
  const want = until === "terminal" ? TERMINAL : new Set(until);
  await expect
    .poll(async () => { last = (await h.get(`/api/runs/${runId}`)).json?.run; return want.has(last?.status ?? "none"); }, { timeout, interval: 500, message: `run ${runId} never reached ${until === "terminal" ? "a terminal status" : until.join("/")}` })
    .toBe(true);
  return last;
}

/** Signature header the product verifies (docs in src/server/publish.ts): t=<unix>,v1=<hmac-sha256 hex of "<t>.<event id>.<raw body>"> */
export function signWebhook(secret: string, body: string, eventId: string, t: number) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${eventId}.${body}`).digest("hex")}`;
}
export const githubSignature = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export { TERMINAL };

// ── fake providers of the throwaway stack ────────────────────────────────────────────────────────────────────────────
/** Origin of the stack's fake SaaS providers (FLOWLINE_ENV=test), learned from the authorize URL the product hands out. */
export async function fakeOrigin(h: Http, workspaceId: string): Promise<string> {
  const r = await h.post("/api/oauth/start", { json: { workspaceId, provider: "slack" } });
  if (r.status !== 200) throw new Error(`oauth start ${r.status}: ${r.text.slice(0, 200)}`);
  return new URL(r.json.url).origin;
}
/** A connection made the way a person pastes a token; the fake accepts "test-token". */
export async function connect(h: Http, workspaceId: string, provider: string, label: string, token = "test-token") {
  const r = await h.post(`/api/workspaces/${workspaceId}/connections`, { json: { provider, label, fields: { token } } });
  if (r.status !== 201) throw new Error(`connect ${provider} ${r.status}: ${r.text.slice(0, 300)}`);
  return r.json.connection as { id: string; provider: string; label: string; status: string };
}
export const slackPost = (connectionId: string, text: string, channel = "C001GEN", requireApproval = false) =>
  N.action("post", "slack.post_message", connectionId, JSON.stringify({ channel, text }), requireApproval);

// ── AI double ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Connects the stack's OpenAI-compatible double as the workspace default model (the owner's Settings → AI Providers step). */
export async function connectAi(h: Http, workspaceId: string, label: string) {
  const key = `sk-fake-${seeded(label, 12)}AAAAAAAA`;
  const r = await h.post(`/api/workspaces/${workspaceId}/ai/connections`, { json: { provider: "openai", label, apiKey: key } });
  if (r.status !== 201) throw new Error(`ai connect ${r.status}: ${r.text.slice(0, 300)}`);
  const id = r.json.connection.id as string;
  await h.put(`/api/workspaces/${workspaceId}/ai/default-route`, { json: { route: { connectionId: id, modelId: "fake-gpt-mini" } } });
  await h.put(`/api/workspaces/${workspaceId}/ai/policy`, { json: { allowUnknownCost: true } });
  return id;
}
/** A new workspace of an actor (UI tests use one per test so counts and lists are exact). */
export async function freshWorkspace(h: Http, label: string) {
  return (await h.post("/api/workspaces", { json: { name: `UI ${seeded(label, 5)}` } })).json.workspace as { id: string; slug: string; name: string };
}
