import Papa from "papaparse";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { estimateTokens, getAiProvider, validateAgainstSchema } from "@/ai/provider";
import { executeGraph, NodeError, type HostHandler, type NodeEnv, type NodeOutcome } from "@/engine/execute";
import { normalizeValue, VALUE_MAX_BYTES } from "@/engine/expression";
import { NONDETERMINISTIC, UNSTABLE_INPUT_MESSAGE } from "@/engine/validate";
import { evaluateIsolated, extractPdfTextIsolated } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { createProviderHttp } from "@/integrations/http";
import { getAction } from "@/integrations/registry";
import { ProviderError, type ActionContext } from "@/integrations/types";
import { checkGate, consumeRetry } from "@/server/approvals";
import { runCodeInSandbox } from "@/server/code-sandbox";
import { ConnectionError, getRuntimeCredentials, markConnectionUnhealthy } from "@/server/connections";
import { sha256Hex } from "@/server/crypto";
import { EgressError, safeFetch } from "@/server/egress";
import { logEvent } from "@/server/events";
import { redact } from "@/server/redact";
import { aiCostMicros, BudgetExceededError, priceFor, releaseUsage, reserveUsage, settleUsage } from "@/server/usage";
import { attemptsFor, backoffMs, sleep } from "./retry";

export const MAX_SUBFLOW_DEPTH = 3;
const FILE_MAX_BYTES = 5 * 1024 * 1024;

export interface HandlerContext {
  db: Db;
  run: typeof schema.run.$inferSelect;
  workspace: typeof schema.workspace.$inferSelect;
  /** Node ids that were mid-execution when a previous worker died (their outcome is unknown). */
  interrupted: Set<string>;
  /** Secret values used by this run — redacted from anything persisted. */
  secrets: string[];
  /** Subflow nesting: path prefix for idempotency keys, stack of flow ids for cycle detection. */
  path: string;
  flowStack: string[];
  depth: number;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Stable across retries, resumes and worker restarts; unique per run + node path. */
function idempotencyKey(ctx: HandlerContext, node: FlowNode) {
  return `fl_${sha256Hex(`${ctx.run.id}:${ctx.path}${node.id}`).slice(0, 32)}`;
}

function contentOf(v: unknown) {
  return typeof v === "string" ? v : JSON.stringify(v ?? null);
}

export function createHandler(ctx: HandlerContext): HostHandler {
  const handler: HostHandler = async (node, input, env) => {
    const cfg = node.data.config as unknown as Record<string, unknown>;
    switch (node.type) {
      case "http.request":
        return httpRequest(ctx, node, cfg, input, env);
      case "ai.generate":
      case "ai.extract":
      case "ai.classify":
        return aiNode(ctx, node, cfg, input, env);
      case "integration.action":
        return integrationAction(ctx, node, cfg, input, env);
      case "code.js":
        return { kind: "ok", output: await runCodeInSandbox(str(cfg.code), input, Number(cfg.timeoutMs) || 5000, env.signal) };
      case "data.file":
        return fileNode(ctx, cfg, input, env);
      case "data.store":
        return storeNode(ctx, cfg, input, env);
      case "flow.subflow":
      case "logic.loop":
        return subflowNode(ctx, node, cfg, input, env);
      default:
        throw new NodeError("NOT_AVAILABLE", `${node.type} is not supported by this worker`);
    }
  };
  return handler;
}

/* ───────────── HTTP ───────────── */

async function httpRequest(ctx: HandlerContext, node: FlowNode, cfg: Record<string, unknown>, input: unknown, env: NodeEnv): Promise<NodeOutcome> {
  const url = await env.evaluate(str(cfg.url), input);
  if (typeof url !== "string") throw new NodeError("INVALID_INPUT", "URL expression must produce a string");
  const method = str(cfg.method) || "GET";
  const headersVal = str(cfg.headers).trim() ? await env.evaluate(str(cfg.headers), input) : {};
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((headersVal as Record<string, unknown>) ?? {})) {
    if (/^(host|content-length|connection|transfer-encoding)$/i.test(k)) continue;
    headers[k.toLowerCase()] = String(v);
  }
  let body: string | undefined;
  if (str(cfg.body).trim() && method !== "GET") {
    body = JSON.stringify(await env.evaluate(str(cfg.body), input));
    headers["content-type"] ??= "application/json";
  }
  const sideEffect = method === "GET" ? "none" : str(cfg.sideEffect) || "non_idempotent";
  const max = attemptsFor(cfg.retry as { maxAttempts?: number });

  // Non-idempotent requests whose outcome is unknown (lost response, or a worker died mid-request)
  // are never blindly re-sent: a human reviews, bound to this exact request (header names only).
  const gate = {
    workspaceId: ctx.run.workspaceId,
    runId: ctx.run.id,
    flowVersionId: ctx.run.flowVersionId,
    nodeId: `${ctx.path}${node.id}`,
    actionId: "http.request",
    args: { method, url, headers: Object.keys(headers).sort(), body: body ?? null },
    connectionId: null,
    secrets: ctx.secrets,
    kind: "review" as const,
  };
  const review = async (): Promise<NodeOutcome | null> => {
    const g = await checkGate(ctx.db, gate);
    if (g.status === "pending") return { kind: "pause", status: "uncertain", message: `No response from ${new URL(url).host} — the request may have been applied. Mark it done, retry, or fail.`, meta: { reviewId: g.approvalId } };
    if (g.status === "rejected") throw new NodeError("OUTCOME_UNKNOWN", "The request's outcome was unknown and a reviewer failed the step");
    if (g.resolution === "done") return { kind: "ok", output: { confirmedByReviewer: true }, meta: { resolvedBy: "review" } };
    await consumeRetry(ctx.db, g.approvalId);
    return null; // one reviewed retry
  };
  if (sideEffect === "non_idempotent") {
    const prior = ctx.interrupted.has(node.id)
      ? [true]
      : await ctx.db
          .select({ id: schema.approval.id })
          .from(schema.approval)
          .where(and(eq(schema.approval.runId, ctx.run.id), eq(schema.approval.nodeId, gate.nodeId), eq(schema.approval.kind, "review")))
          .limit(1);
    if (prior.length > 0) {
      if (ctx.interrupted.has(node.id)) await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_uncertain", nodeId: node.id, data: { reason: "interrupted" } });
      const r = await review();
      if (r) return r;
    }
  }

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await safeFetch(url, { method, headers, body, timeoutMs: Number(cfg.timeoutMs) || 15000, maxBytes: 1024 * 1024, signal: env.signal });
      if (res.status === 429 || res.status >= 500) throw new ProviderError(res.status === 429 ? "rate_limit" : "server", `HTTP ${res.status}`, res.status);
      const text = res.text();
      let data: unknown = text;
      if ((res.headers.get("content-type") ?? "").includes("json")) {
        try {
          data = JSON.parse(text);
        } catch {
          /* keep text */
        }
      }
      if (text.length > VALUE_MAX_BYTES) data = text.slice(0, VALUE_MAX_BYTES);
      return { kind: "ok", output: { status: res.status, ok: res.status < 400, contentType: res.headers.get("content-type"), body: data }, attempts: attempt };
    } catch (e) {
      if (e instanceof EgressError) throw new NodeError(e.code, e.message);
      if (env.signal.aborted) throw e;
      const pe = e instanceof ProviderError ? e : new ProviderError((e as Error).name === "TimeoutError" ? "timeout" : "response_lost", (e as Error).message);
      if (pe.outcomeUnknown && sideEffect === "non_idempotent") {
        await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_uncertain", nodeId: node.id, data: { kind: pe.kind } });
        const r = await review();
        if (r) return { ...r, attempts: attempt } as NodeOutcome;
        throw new NodeError("OUTCOME_UNKNOWN", "The request's outcome is unknown"); // unreachable: a fresh review is always pending
      }
      if ((pe.retryable || pe.outcomeUnknown) && attempt < max) {
        env.log(`attempt ${attempt} failed (${pe.kind}); retrying`);
        await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_retry", nodeId: node.id, data: { attempt, kind: pe.kind } });
        await sleep(backoffMs(attempt, pe.retryAfterMs), env.signal);
        continue;
      }
      throw new NodeError(`HTTP_${pe.kind.toUpperCase()}`, pe.message);
    }
  }
}

/* ───────────── AI ───────────── */

const CLASSIFY_SCHEMA = (labels: string[]) => ({
  type: "object",
  properties: { label: { type: "string", enum: labels }, confidence: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string", maxLength: 500 } },
  required: ["label", "confidence", "reason"],
  additionalProperties: false,
});

async function aiNode(ctx: HandlerContext, node: FlowNode, cfg: Record<string, unknown>, input: unknown, env: NodeEnv): Promise<NodeOutcome> {
  const provider = getAiProvider();
  if (!provider.available) throw new NodeError("AI_UNAVAILABLE", provider.reason ?? "No AI provider configured");
  const model = str(cfg.model) || provider.model;
  const content = contentOf(await env.evaluate(str(cfg.source) || "$string($)", input));
  const maxTokens = Math.min(Math.max(16, Number(cfg.maxTokens) || 400), 4000);
  let schema: Record<string, unknown> | undefined;
  if (node.type === "ai.extract") schema = JSON.parse(str(cfg.schema));
  const labels = str(cfg.labels).split(",").map((l) => l.trim()).filter(Boolean);
  if (node.type === "ai.classify") schema = CLASSIFY_SCHEMA(labels);

  const price = priceFor(ctx.workspace.prices ?? {}, `ai:${provider.id}/${model}`);
  const est = aiCostMicros(price, estimateTokens(str(cfg.instructions) + content), maxTokens);
  const max = 3;
  for (let attempt = 1; ; attempt++) {
    const key = `${ctx.run.id}:${ctx.path}${node.id}:ai:${attempt}`;
    try {
      await reserveUsage(ctx.db, { workspaceId: ctx.run.workspaceId, runId: ctx.run.id, nodeId: node.id, kind: "ai", idempotencyKey: key, retry: attempt > 1, estimatedMicros: est.cost, provider: provider.id, model, unpriced: est.unpriced });
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "budget_blocked", nodeId: node.id, data: { message: e.message } });
        throw new NodeError("BUDGET_EXCEEDED", e.message);
      }
      throw e;
    }
    try {
      const r = await provider.generate({ instructions: str(cfg.instructions), content, maxTokens, schema, model, signal: env.signal });
      const cost = aiCostMicros(price, r.usage.inputTokens, r.usage.outputTokens);
      await settleUsage(ctx.db, key, { costMicros: cost.cost, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, unpriced: cost.unpriced });
      const meta = { provider: r.provider, model: r.model, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costMicros: cost.cost, unpriced: cost.unpriced, quarantinedLines: r.quarantined.length };
      if (r.quarantined.length && attempt === 1) {
        env.log(`security: removed ${r.quarantined.length} line(s) from the content that tried to instruct the AI`);
        await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "ai_instructions_quarantined", nodeId: node.id, data: { lines: r.quarantined.length } });
      }
      if (!schema) return { kind: "ok", output: { text: r.text }, meta, attempts: attempt };
      const problem = validateAgainstSchema(schema, r.json);
      if (problem) {
        if (attempt < 2) {
          env.log(`output didn't match the schema (${problem}); asking again`);
          continue;
        }
        throw new NodeError("AI_SCHEMA_MISMATCH", `Model output doesn't match the schema: ${problem}`);
      }
      return { kind: "ok", output: normalizeValue(r.json), meta, attempts: attempt };
    } catch (e) {
      if (e instanceof NodeError && e.code === "AI_SCHEMA_MISMATCH") throw e;
      const retryable = Boolean((e as { retryable?: boolean }).retryable) || (e as NodeError).code === "AI_TIMEOUT" || (e as NodeError).code === "AI_UNAVAILABLE";
      // A request that never produced a response is charged nothing.
      await releaseUsage(ctx.db, key);
      if (env.signal.aborted) throw e;
      if (retryable && attempt < max) {
        await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_retry", nodeId: node.id, data: { attempt, error: (e as Error).message } });
        await sleep(backoffMs(attempt), env.signal);
        continue;
      }
      throw e;
    }
  }
}

/* ───────────── Integration actions ───────────── */

async function integrationAction(ctx: HandlerContext, node: FlowNode, cfg: Record<string, unknown>, input: unknown, env: NodeEnv): Promise<NodeOutcome> {
  const found = getAction(str(cfg.actionId));
  if (!found) throw new NodeError("UNKNOWN_ACTION", `Action ${str(cfg.actionId)} isn't available`);
  const { provider, action } = found;
  const connectionId = str(cfg.connectionId);
  // The run's permission policy pinned the connection at enqueue; the graph version is immutable, so they must agree.
  if (ctx.run.policy?.connections?.[node.id] && ctx.run.policy.connections[node.id] !== connectionId) {
    throw new NodeError("POLICY_MISMATCH", "The connection differs from the run's permission policy");
  }

  let rt: Awaited<ReturnType<typeof getRuntimeCredentials>>;
  try {
    rt = await getRuntimeCredentials(ctx.db, { connectionId, workspaceId: ctx.run.workspaceId, providerId: provider.id, requiredScopes: action.requiredScopes });
  } catch (e) {
    if (e instanceof ConnectionError) {
      await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "connection_blocked", nodeId: node.id, data: { code: e.code } });
      throw new NodeError(e.code, e.message);
    }
    throw e;
  }
  ctx.secrets.push(...rt.secrets);

  const rawArgs = await env.evaluate(str(cfg.inputMapping) || "{}", input);
  const parsed = action.input.safeParse(rawArgs);
  if (!parsed.success) {
    throw new NodeError("INVALID_INPUT", `Input for ${action.title} is invalid: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(input)"} ${i.message}`).join("; ")}`);
  }
  const args = parsed.data;

  // Human approval: bound to this run + revision + node + action + exact args + connection, with expiry.
  const gateBase = { workspaceId: ctx.run.workspaceId, runId: ctx.run.id, flowVersionId: ctx.run.flowVersionId, nodeId: `${ctx.path}${node.id}`, actionId: action.id, args, connectionId, secrets: ctx.secrets };
  if (cfg.requireApproval === true || action.sensitive) {
    // Approval binds the exact arguments; values that change on every evaluation could never match.
    if (NONDETERMINISTIC.test(str(cfg.inputMapping))) throw new NodeError("APPROVAL_UNSTABLE_INPUT", UNSTABLE_INPUT_MESSAGE);
    const gate = await checkGate(ctx.db, { ...gateBase, kind: "approval" });
    if (gate.status === "pending") return { kind: "pause", status: "waiting_approval", message: `Waiting for approval to run ${action.title}`, meta: { approvalId: gate.approvalId } };
    if (gate.status === "rejected") throw new NodeError("APPROVAL_REJECTED", `${action.title} was rejected${gate.note ? `: ${gate.note}` : ""}`);
  }

  const idemKey = idempotencyKey(ctx, node);
  const actx: ActionContext = {
    http: createProviderHttp(provider, rt.creds, env.signal),
    credentials: rt.creds,
    idempotencyKey: idemKey,
    signal: env.signal,
    log: (m) => env.log(redact(m, ctx.secrets)),
  };
  const meta: Record<string, unknown> = { provider: provider.id, action: action.id, actionVersion: action.version, connection: rt.connection.label, idempotencyKey: idemKey, sideEffect: action.sideEffect };

  // Review of an uncertain earlier attempt (lost response the provider couldn't confirm).
  const review = async (): Promise<NodeOutcome | "retry"> => {
    const gate = await checkGate(ctx.db, { ...gateBase, kind: "review" });
    if (gate.status === "pending") {
      return { kind: "pause", status: "uncertain", message: `${action.title} may or may not have been applied by ${provider.name} (lost response). Check it and choose: mark done, retry, or fail.`, meta: { ...meta, reviewId: gate.approvalId } };
    }
    if (gate.status === "rejected") throw new NodeError("OUTCOME_UNKNOWN", `${action.title} outcome was unknown and a reviewer failed the step`);
    if (gate.resolution === "done") return { kind: "ok", output: { confirmedByReviewer: true }, meta: { ...meta, resolvedBy: "review" } };
    await consumeRetry(ctx.db, gate.approvalId);
    return "retry";
  };

  // After a lost response for a non-idempotent action: verify with the provider, else ask a human.
  const resolveUnknown = async (): Promise<NodeOutcome | "retry"> => {
    if (action.verify) {
      for (let v = 1; v <= 3; v++) {
        try {
          const res = await action.verify(actx, args);
          await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_verified", nodeId: node.id, data: { happened: res.happened } });
          if (res.happened) return { kind: "ok", output: normalizeValue(res.output ?? { verified: true }), meta: { ...meta, verifiedAfterLostResponse: true } };
          return "retry"; // provably not applied → safe to send again
        } catch (e) {
          if (e instanceof ProviderError && e.retryable && v < 3) {
            await sleep(backoffMs(v, e.retryAfterMs), env.signal);
            continue;
          }
          break;
        }
      }
    }
    await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_uncertain", nodeId: node.id, data: { action: action.id } });
    return review();
  };

  // A previous worker died while this step was in flight.
  let cleared = false;
  if (ctx.interrupted.has(node.id) && action.sideEffect === "non_idempotent") {
    const r = await resolveUnknown();
    if (r !== "retry") return r;
    cleared = true;
  }
  // A reviewer may already have decided on an earlier uncertain attempt of this step.
  const priorReview = cleared
    ? []
    : await ctx.db
        .select({ id: schema.approval.id })
        .from(schema.approval)
        .where(and(eq(schema.approval.runId, ctx.run.id), eq(schema.approval.nodeId, `${ctx.path}${node.id}`), eq(schema.approval.kind, "review")))
        .limit(1);
  if (priorReview.length > 0) {
    const r = await review();
    if (r !== "retry") return r;
  }

  const price = priceFor(ctx.workspace.prices ?? {}, `action:${action.id}`) ?? priceFor(ctx.workspace.prices ?? {}, `action:${provider.id}/*`);
  const max = attemptsFor(cfg.retry as { maxAttempts?: number });
  for (let attempt = 1; ; attempt++) {
    const usageKey = `${ctx.run.id}:${ctx.path}${node.id}:action:${attempt}`;
    try {
      await reserveUsage(ctx.db, { workspaceId: ctx.run.workspaceId, runId: ctx.run.id, nodeId: node.id, kind: "action", idempotencyKey: usageKey, retry: attempt > 1, estimatedMicros: price?.perCallMicros ?? 0, provider: provider.id, unpriced: !price });
    } catch (e) {
      if (e instanceof BudgetExceededError) throw new NodeError("BUDGET_EXCEEDED", e.message);
      throw e;
    }
    try {
      const out = await action.run(actx, args);
      await settleUsage(ctx.db, usageKey, { costMicros: price?.perCallMicros ?? 0, unpriced: !price });
      const checked = action.output.safeParse(out);
      if (!checked.success) throw new NodeError("PROVIDER_CONTRACT", `${provider.name} returned an unexpected response shape`);
      return { kind: "ok", output: normalizeValue(checked.data), meta, attempts: attempt };
    } catch (e) {
      if (e instanceof NodeError) throw e;
      if (env.signal.aborted) {
        if (action.sideEffect === "non_idempotent") throw new NodeError("CANCELLED_IN_FLIGHT", `Cancelled while ${action.title} was in flight — it may have been applied`);
        throw e;
      }
      const pe = e instanceof ProviderError ? e : new ProviderError("client", (e as Error).message);
      if (pe.kind === "network" || pe.kind === "egress_blocked") await releaseUsage(ctx.db, usageKey);
      else await settleUsage(ctx.db, usageKey, { costMicros: price?.perCallMicros ?? 0, unpriced: !price });
      if (pe.kind === "auth") {
        await markConnectionUnhealthy(ctx.db, connectionId, "expired", pe.message);
        throw new NodeError("CONNECTION_AUTH", `${provider.name} rejected the connection (${pe.message}). Flows using it are paused until it's reconnected.`);
      }
      if (pe.outcomeUnknown) {
        if (action.sideEffect !== "non_idempotent" && attempt < max) {
          await sleep(backoffMs(attempt), env.signal);
          continue;
        }
        if (action.sideEffect === "non_idempotent") {
          const r = await resolveUnknown();
          if (r !== "retry") return r;
          if (attempt < max) continue;
          throw new NodeError("PROVIDER_TIMEOUT", `${provider.name} kept failing to respond`);
        }
      }
      if (pe.retryable && attempt < max) {
        env.log(`attempt ${attempt}: ${pe.kind}${pe.retryAfterMs ? ` (retry after ${pe.retryAfterMs}ms)` : ""}`);
        await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_retry", nodeId: node.id, data: { attempt, kind: pe.kind, status: pe.status } });
        await sleep(backoffMs(attempt, pe.retryAfterMs), env.signal);
        continue;
      }
      throw new NodeError(`PROVIDER_${pe.kind.toUpperCase()}`, redact(pe.message, ctx.secrets));
    }
  }
}

/* ───────────── Files & store ───────────── */

async function fileNode(ctx: HandlerContext, cfg: Record<string, unknown>, input: unknown, env: NodeEnv): Promise<NodeOutcome> {
  let bytes: Buffer;
  let name = "input";
  if (cfg.from === "upload") {
    const [f] = await ctx.db.select().from(schema.fileObject).where(and(eq(schema.fileObject.id, str(cfg.fileId)), eq(schema.fileObject.workspaceId, ctx.run.workspaceId)));
    if (!f) throw new NodeError("FILE_NOT_FOUND", "The uploaded file doesn't exist in this workspace");
    bytes = f.data;
    name = f.name;
  } else if (cfg.from === "url") {
    const url = await env.evaluate(str(cfg.source), input);
    if (typeof url !== "string") throw new NodeError("INVALID_INPUT", "URL expression must produce a string");
    try {
      const res = await safeFetch(url, { timeoutMs: 20000, maxBytes: FILE_MAX_BYTES, signal: env.signal });
      if (res.status >= 400) throw new NodeError("FILE_FETCH_FAILED", `Fetching the file returned HTTP ${res.status}`);
      bytes = Buffer.from(res.body);
    } catch (e) {
      if (e instanceof EgressError) throw new NodeError(e.code, e.message);
      throw e;
    }
  } else {
    const data = await env.evaluate(str(cfg.source), input);
    if (typeof data !== "string") throw new NodeError("INVALID_INPUT", "Expected base64 file data");
    bytes = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }
  if (bytes.length > FILE_MAX_BYTES) throw new NodeError("FILE_TOO_LARGE", "Files are limited to 5MB");
  const meta = { name, bytes: bytes.length, sha256: sha256Hex(bytes) };
  switch (cfg.as) {
    case "pdf_text": {
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new NodeError("NOT_A_PDF", "The file is not a PDF");
      const r = await extractPdfTextIsolated(bytes.toString("base64"));
      return { kind: "ok", output: { text: r.text, pages: r.pages }, meta };
    }
    case "json":
      try {
        return { kind: "ok", output: normalizeValue(JSON.parse(bytes.toString("utf8"))), meta };
      } catch {
        throw new NodeError("INVALID_JSON", "The file is not valid JSON");
      }
    case "csv": {
      const parsed = Papa.parse<Record<string, string>>(bytes.toString("utf8"), { header: true, skipEmptyLines: true });
      if (parsed.data.length > 5000) throw new NodeError("TOO_MANY_ROWS", "CSV has more than 5,000 rows");
      return { kind: "ok", output: { rows: parsed.data, rowCount: parsed.data.length, fields: parsed.meta.fields ?? [] }, meta };
    }
    default: {
      const text = bytes.toString("utf8");
      if (text.length > VALUE_MAX_BYTES) throw new NodeError("VALUE_TOO_LARGE", "Text is larger than 256KB");
      return { kind: "ok", output: { text }, meta };
    }
  }
}

async function storeNode(ctx: HandlerContext, cfg: Record<string, unknown>, input: unknown, env: NodeEnv): Promise<NodeOutcome> {
  const key = contentOf(await env.evaluate(str(cfg.key), input)).slice(0, 200);
  const namespace = str(cfg.namespace);
  if (cfg.op === "get") {
    const [row] = await ctx.db
      .select()
      .from(schema.kvEntry)
      .where(and(eq(schema.kvEntry.workspaceId, ctx.run.workspaceId), eq(schema.kvEntry.namespace, namespace), eq(schema.kvEntry.key, key)));
    return { kind: "ok", output: { key, found: Boolean(row), value: row?.value ?? null, updatedAt: row?.updatedAt ?? null, input } };
  }
  const value = normalizeValue(await env.evaluate(str(cfg.value), input));
  if (JSON.stringify(value).length > 64 * 1024) throw new NodeError("VALUE_TOO_LARGE", "Stored values are limited to 64KB");
  await ctx.db
    .insert(schema.kvEntry)
    .values({ workspaceId: ctx.run.workspaceId, namespace, key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.kvEntry.workspaceId, schema.kvEntry.namespace, schema.kvEntry.key], set: { value: value as object, updatedAt: new Date() } });
  return { kind: "ok", output: { key, stored: true, value } };
}

/* ───────────── Subflows & loops ───────────── */

async function loadSubflow(ctx: HandlerContext, flowId: string, version: number) {
  const [row] = await ctx.db
    .select({ graph: schema.flowVersion.graph, reason: schema.flowVersion.reason, workspaceId: schema.flow.workspaceId, name: schema.flow.name, deletedAt: schema.flow.deletedAt })
    .from(schema.flowVersion)
    .innerJoin(schema.flow, eq(schema.flow.id, schema.flowVersion.flowId))
    .where(and(eq(schema.flowVersion.flowId, flowId), eq(schema.flowVersion.version, version)));
  if (!row || row.workspaceId !== ctx.run.workspaceId || row.deletedAt) throw new NodeError("SUBFLOW_NOT_FOUND", "The subflow version doesn't exist in this workspace");
  if (row.reason !== "publish") throw new NodeError("SUBFLOW_NOT_PUBLISHED", `Version ${version} of "${row.name}" is not a published version`);
  return { graph: row.graph as FlowGraph, name: row.name };
}

/** True if running the graph could have a non-idempotent external effect (nested subflows count, conservatively). */
function hasNonIdempotentStep(graph: FlowGraph): boolean {
  return graph.nodes.some((n) => {
    const c = n.data.config as unknown as Record<string, unknown>;
    if (n.type === "integration.action") {
      const effect = getAction(str(c.actionId))?.action.sideEffect;
      return effect !== "idempotent" && effect !== "none";
    }
    if (n.type === "http.request") return (str(c.method) || "GET") !== "GET" && (str(c.sideEffect) || "non_idempotent") === "non_idempotent";
    return n.type === "flow.subflow" || n.type === "logic.loop";
  });
}

async function subflowNode(ctx: HandlerContext, node: FlowNode, cfg: Record<string, unknown>, input: unknown, env: NodeEnv): Promise<NodeOutcome> {
  const flowId = str(cfg.flowId);
  const version = Number(cfg.version);
  if (ctx.depth >= MAX_SUBFLOW_DEPTH) throw new NodeError("SUBFLOW_DEPTH", `Subflows can nest at most ${MAX_SUBFLOW_DEPTH} levels`);
  if (ctx.flowStack.includes(flowId)) throw new NodeError("SUBFLOW_CYCLE", "This subflow calls itself (directly or indirectly)");
  const sub = await loadSubflow(ctx, flowId, version);

  // Child steps aren't checkpointed. If a worker died while this node ran, the children may have
  // partly executed: re-running them could repeat non-idempotent effects, so a human decides.
  if (ctx.interrupted.has(node.id) && hasNonIdempotentStep(sub.graph)) {
    const g = await checkGate(ctx.db, {
      workspaceId: ctx.run.workspaceId,
      runId: ctx.run.id,
      flowVersionId: ctx.run.flowVersionId,
      nodeId: `${ctx.path}${node.id}`,
      actionId: node.type,
      args: { flowId, version },
      connectionId: null,
      secrets: ctx.secrets,
      kind: "review",
    });
    if (g.status === "pending") {
      await logEvent(ctx.db, { runId: ctx.run.id, workspaceId: ctx.run.workspaceId, type: "step_uncertain", nodeId: node.id, data: { reason: "interrupted" } });
      return { kind: "pause", status: "uncertain", message: `"${sub.name}" was interrupted and may have partly run steps with external effects. Check, then mark done, retry, or fail.`, meta: { reviewId: g.approvalId } };
    }
    if (g.status === "rejected") throw new NodeError("OUTCOME_UNKNOWN", `"${sub.name}" was interrupted and a reviewer failed the step`);
    if (g.resolution === "done") return { kind: "ok", output: { confirmedByReviewer: true }, meta: { subflow: sub.name, version, resolvedBy: "review" } };
    await consumeRetry(ctx.db, g.approvalId);
  }

  const runChild = async (childInput: unknown, index?: number) => {
    // Children get their own (empty) interrupted set: parent node ids mean nothing inside the subflow.
    const childCtx: HandlerContext = { ...ctx, interrupted: new Set(), path: `${ctx.path}${node.id}${index === undefined ? "" : `[${index}]`}/`, flowStack: [...ctx.flowStack, flowId], depth: ctx.depth + 1 };
    // Subflow expressions run in the same isolated sandbox as the parent flow.
    const res = await executeGraph(sub.graph, childInput, { handler: createHandler(childCtx), evaluate: evaluateIsolated, signal: env.signal, concurrency: 2 });
    if (res.status === "waiting_approval") throw new NodeError("SUBFLOW_NEEDS_APPROVAL", `"${sub.name}" needs a human decision — subflows can't pause; move that step into the parent flow`);
    if (res.status !== "succeeded") throw new NodeError("SUBFLOW_FAILED", `"${sub.name}" ${res.status}${res.error ? `: ${res.error.message}` : ""}`);
    return res.output;
  };
  if (node.type === "flow.subflow") {
    const childInput = str(cfg.input).trim() ? await env.evaluate(str(cfg.input), input) : input;
    return { kind: "ok", output: normalizeValue(await runChild(childInput)), meta: { subflow: sub.name, version } };
  }
  const items = await env.evaluate(str(cfg.items), input);
  if (!Array.isArray(items)) throw new NodeError("INVALID_INPUT", "Loop items must be an array");
  const maxItems = Number(cfg.maxItems);
  if (items.length > maxItems) throw new NodeError("LOOP_LIMIT", `${items.length} items exceeds this loop's limit of ${maxItems} — raise it or filter first`);
  const outputs: unknown[] = [];
  for (let i = 0; i < items.length; i++) {
    if (env.signal.aborted) throw new NodeError("CANCELLED", "Run was cancelled");
    outputs.push(await runChild(items[i], i));
  }
  return { kind: "ok", output: normalizeValue({ items: outputs, count: outputs.length }), meta: { subflow: sub.name, version, iterations: items.length } };
}

export async function workspaceActiveCount(db: Db, workspaceId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.run).where(and(eq(schema.run.workspaceId, workspaceId), eq(schema.run.status, "running")));
  return n;
}
