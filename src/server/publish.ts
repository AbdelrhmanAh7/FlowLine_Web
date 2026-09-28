import { createHmac, timingSafeEqual } from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { and, eq } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import type { FlowGraph, ValidationIssue } from "@/engine/types";
import { TRIGGER_TYPES } from "@/engine/types";
import { validateGraph } from "@/engine/validate";
import { getAction } from "@/integrations/registry";
import { aiRoutesIn, assertRoutesUsable, pinDefaultRoutes } from "@/ai/hub/selection";
import type { CurrentUser } from "./access";
import { assertConnectionsUsable } from "./connections";
import { decryptSecret, encryptSecret, randomToken } from "./crypto";
import { insertVersion } from "./flows";
import { HttpError, notFound } from "./http";

export const WEBHOOK_TOLERANCE_SEC = 300;
export const WEBHOOK_MAX_BYTES = 256 * 1024;

/** Server-side checks that need the database: connections, actions, subflows. */
export async function serverIssues(dbx: Db, workspaceId: string, graph: FlowGraph, depth = 0, seen: string[] = []): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const n of graph.nodes) {
    const cfg = n.data.config as unknown as Record<string, unknown>;
    const push = (code: string, message: string) => issues.push({ code, message: `${n.data.label}: ${message}`, nodeId: n.id });
    if (n.type === "integration.action") {
      const found = getAction(String(cfg.actionId ?? ""));
      if (!found) {
        push("UNKNOWN_ACTION", "this app action isn't available");
        continue;
      }
      const [conn] = cfg.connectionId
        ? await dbx.select().from(schema.connection).where(and(eq(schema.connection.id, String(cfg.connectionId)), eq(schema.connection.workspaceId, workspaceId)))
        : [];
      if (!conn) push("MISSING_CONNECTION", `choose a ${found.provider.name} connection from this workspace`);
      else if (conn.provider !== found.provider.id) push("WRONG_CONNECTION", `the connection is for ${conn.provider}, not ${found.provider.name}`);
      else if (conn.status !== "active") push("CONNECTION_UNHEALTHY", `${conn.label} is ${conn.status} — reconnect it`);
    }
    if (n.type === "flow.subflow" || n.type === "logic.loop") {
      const flowId = String(cfg.flowId ?? "");
      const version = Number(cfg.version);
      if (seen.includes(flowId)) {
        push("SUBFLOW_CYCLE", "this subflow eventually calls itself");
        continue;
      }
      if (depth >= 3) {
        push("SUBFLOW_DEPTH", "subflows can nest at most 3 levels");
        continue;
      }
      const [row] = flowId
        ? await dbx
            .select({ graph: schema.flowVersion.graph, reason: schema.flowVersion.reason, workspaceId: schema.flow.workspaceId })
            .from(schema.flowVersion)
            .innerJoin(schema.flow, eq(schema.flow.id, schema.flowVersion.flowId))
            .where(and(eq(schema.flowVersion.flowId, flowId), eq(schema.flowVersion.version, version)))
        : [];
      if (!row || row.workspaceId !== workspaceId) push("SUBFLOW_NOT_FOUND", "choose a published subflow from this workspace");
      else if (row.reason !== "publish") push("SUBFLOW_NOT_PUBLISHED", `version ${version} isn't a published version`);
      else {
        const sub = row.graph as FlowGraph;
        if (sub.nodes.some((x) => x.type === "integration.action" && ((x.data.config as { requireApproval?: boolean }).requireApproval || getAction(String((x.data.config as { actionId?: string }).actionId))?.action.sensitive))) {
          push("SUBFLOW_APPROVAL", "subflows can't contain steps that need human approval");
        }
        issues.push(...(await serverIssues(dbx, workspaceId, sub, depth + 1, [...seen, flowId])).map((i) => ({ ...i, message: `in subflow → ${i.message}`, nodeId: n.id })));
      }
    }
  }
  return issues;
}

export function nextFire(cron: string, timezone: string, after = new Date()): Date {
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: after }).next().toDate();
}

export function webhookUrl(token: string) {
  return `${(process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/hooks/${token}`;
}

export async function publishFlow(user: CurrentUser, flowId: string) {
  return db.transaction(async (tx) => {
    const [flow] = await tx.select().from(schema.flow).where(eq(schema.flow.id, flowId)).for("update");
    if (!flow || flow.deletedAt) throw notFound("Flow not found");
    const graph = flow.graph as FlowGraph;
    const issues = [...validateGraph(graph), ...(await serverIssues(tx as unknown as Db, flow.workspaceId, graph, 0, [flow.id]))];
    if (issues.length) throw new HttpError(422, "INVALID_FLOW", "Fix these issues before publishing", issues);
    // Triggered runs act for the publisher: they must be allowed to use every connection in the flow.
    const connIds = [...new Set(graph.nodes.map((n) => (n.data.config as { connectionId?: string }).connectionId).filter((x): x is string => Boolean(x)))];
    await assertConnectionsUsable(tx as unknown as Db, user.id, flow.workspaceId, connIds);
    // AI: the published version snapshots the resolved route (workspace default pinned on steps without their own),
    // and the publisher — whom triggered runs act for — must be allowed to use every AI connection it names.
    const [ws] = await tx.select({ route: schema.workspace.aiDefaultRoute }).from(schema.workspace).where(eq(schema.workspace.id, flow.workspaceId));
    const pinned = pinDefaultRoutes(graph, ws?.route);
    await assertRoutesUsable(tx as unknown as Db, user.id, flow.workspaceId, aiRoutesIn(pinned));
    const version = await insertVersion(tx, user, { ...flow, graph: pinned }, "publish");
    await tx.update(schema.flow).set({ publishedVersionId: version.id, publishedBy: user.id, updatedAt: new Date() }).where(eq(schema.flow.id, flow.id));

    const trigger = graph.nodes.find((n) => TRIGGER_TYPES.includes(n.type))!;
    let webhook: { url: string; secret?: string } | null = null;
    let scheduleInfo: { cron: string; timezone: string; nextFireAt: Date } | null = null;
    if (trigger.type === "trigger.webhook") {
      const [ep] = await tx.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.flowId, flow.id));
      if (ep) {
        await tx.update(schema.webhookEndpoint).set({ active: true }).where(eq(schema.webhookEndpoint.id, ep.id));
        webhook = { url: webhookUrl(ep.token) };
      } else {
        const secret = `whsec_${randomToken(32)}`;
        const enc = encryptSecret(secret);
        const token = randomToken(24);
        await tx.insert(schema.webhookEndpoint).values({ flowId: flow.id, workspaceId: flow.workspaceId, token, secretEnc: enc.ciphertext, keyId: enc.keyId });
        webhook = { url: webhookUrl(token), secret };
      }
    } else {
      await tx.update(schema.webhookEndpoint).set({ active: false }).where(eq(schema.webhookEndpoint.flowId, flow.id));
    }
    if (trigger.type === "trigger.schedule") {
      const c = trigger.data.config as { cron: string; timezone: string; missedPolicy: "skip" | "run_once" | "run_all" };
      const next = nextFire(c.cron, c.timezone);
      await tx
        .insert(schema.schedule)
        .values({ flowId: flow.id, workspaceId: flow.workspaceId, cron: c.cron, timezone: c.timezone, missedPolicy: c.missedPolicy, active: true, nextFireAt: next, lastFireAt: new Date() })
        .onConflictDoUpdate({ target: schema.schedule.flowId, set: { cron: c.cron, timezone: c.timezone, missedPolicy: c.missedPolicy, active: true, nextFireAt: next, lastFireAt: new Date(), updatedAt: new Date() } });
      scheduleInfo = { cron: c.cron, timezone: c.timezone, nextFireAt: next };
    } else {
      await tx.update(schema.schedule).set({ active: false }).where(eq(schema.schedule.flowId, flow.id));
    }
    return { version: version.version, versionId: version.id, trigger: trigger.type, webhook, schedule: scheduleInfo };
  });
}

export async function unpublishFlow(flowId: string) {
  await db.update(schema.flow).set({ publishedVersionId: null }).where(eq(schema.flow.id, flowId));
  await db.update(schema.webhookEndpoint).set({ active: false }).where(eq(schema.webhookEndpoint.flowId, flowId));
  await db.update(schema.schedule).set({ active: false }).where(eq(schema.schedule.flowId, flowId));
}

export async function rotateWebhookSecret(flowId: string) {
  const [ep] = await db.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.flowId, flowId));
  if (!ep) throw notFound("This flow has no webhook yet — publish it first");
  const secret = `whsec_${randomToken(32)}`;
  const enc = encryptSecret(secret);
  await db.update(schema.webhookEndpoint).set({ secretEnc: enc.ciphertext, keyId: enc.keyId, rotatedAt: new Date() }).where(eq(schema.webhookEndpoint.id, ep.id));
  return { url: webhookUrl(ep.token), secret };
}

export async function triggerInfo(flowId: string) {
  const [ep] = await db.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.flowId, flowId));
  const [sc] = await db.select().from(schema.schedule).where(eq(schema.schedule.flowId, flowId));
  const recentEvents = ep
    ? await db.select({ eventId: schema.webhookEvent.eventId, status: schema.webhookEvent.status, receivedAt: schema.webhookEvent.receivedAt, runId: schema.webhookEvent.runId, detail: schema.webhookEvent.detail }).from(schema.webhookEvent).where(eq(schema.webhookEvent.endpointId, ep.id)).orderBy(schema.webhookEvent.id).limit(20)
    : [];
  return {
    webhook: ep ? { url: webhookUrl(ep.token), active: ep.active, rotatedAt: ep.rotatedAt, recentEvents } : null,
    schedule: sc ? { cron: sc.cron, timezone: sc.timezone, missedPolicy: sc.missedPolicy, active: sc.active, nextFireAt: sc.nextFireAt, lastFireAt: sc.lastFireAt } : null,
  };
}

/**
 * Signature: header `x-flowline-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<event id>.<raw body>")>`.
 * The event id is signed too, so a captured request can't be replayed under a fresh id.
 */
export function signWebhook(secret: string, body: string, eventId: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${eventId}.${body}`).digest("hex")}`;
}

/**
 * GitHub scheme: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(secret, raw body)>`. GitHub signs neither a
 * timestamp nor the delivery id, so the receiver also refuses a signature it has already accepted
 * (webhook_event.signature is unique per endpoint): a captured delivery can't be replayed under a new id.
 */
export function verifyGithubSignature(secretEnc: string, keyId: string, header: string | null, body: string): { ok: true } | { ok: false; reason: string } {
  if (!header?.startsWith("sha256=")) return { ok: false, reason: "missing X-Hub-Signature-256" };
  const secret = decryptSecret<string>(secretEnc, keyId);
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(header.slice(7), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export function verifyWebhookSignature(secretEnc: string, keyId: string, header: string | null, body: string, eventId: string, now = Date.now()): { ok: true; t: number } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return { ok: false, reason: "malformed signature" };
  if (Math.abs(now / 1000 - t) > WEBHOOK_TOLERANCE_SEC) return { ok: false, reason: "signature timestamp outside tolerance" };
  const secret = decryptSecret<string>(secretEnc, keyId);
  const expected = createHmac("sha256", secret).update(`${t}.${eventId}.${body}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(parts.v1, "hex");
  } catch {
    return { ok: false, reason: "malformed signature" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature mismatch" };
  return { ok: true, t };
}
