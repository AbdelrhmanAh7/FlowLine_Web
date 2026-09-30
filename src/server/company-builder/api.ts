import { z } from "zod";
import { CLI_KINDS, type Envelope } from "@/company-builder/cli/envelope";
import { getLocale } from "@/i18n/server";
import { requireUser, requireWorkspace, type Need } from "@/server/access";
import { HttpError, json, notFound, parseBody } from "@/server/http";
import { approveBlueprint, generateDeterministic, requireBlueprint } from "./blueprints";
import { cancelJob, enqueueJob, exportJob, importJobResult, listJobs, requireJob } from "./cli-jobs";
import { cancelDevTrial, grantDevTrial, reconcileEntitlement } from "./entitlement";
import { assertCompanyBuilderEnabled, assertPrototypeAccess, prototypeAccess } from "./gate";
import { cancelInstallation, install } from "./install";
import { sessionOverview, workspaceSessions } from "./overview";
import { decideReview, listReviewItems, pauseTask, requestActivation, requestSampleAction, verifyUncertain } from "./reviews";
import { answer, createSession, deleteSession, requireSession, stateOf } from "./sessions";
import { refreshTrial, startTrial } from "./trials";

/**
 * Router for /api/workspaces/[wid]/company-builder/[...path]. Every endpoint: feature gate → signed-in user →
 * workspace membership (404 for non-members) → capability. CLI endpoints additionally require the owner-prototype gate
 * (founder id + designated workspace + private host); everyone else gets the same 404.
 */

type Method = "GET" | "POST" | "DELETE";
interface Ctx {
  req: Request;
  params: string[];
  user: Awaited<ReturnType<typeof requireUser>>;
  workspaceId: string;
}
interface RouteDef {
  method: Method;
  pattern: string[];
  need: Need;
  prototype?: boolean;
  handle: (c: Ctx) => Promise<Response>;
}

const answerBody = z.object({ questionId: z.string().max(64), value: z.unknown().optional(), unknown: z.boolean().optional(), revision: z.number().int(), mode: z.enum(["answer", "correction"]).optional() });
const trialBody = z.object({ trialKey: z.string().min(8).max(64), input: z.record(z.string(), z.unknown()).optional() });
const decideBody = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() });
const jobBody = z.object({ cli: z.enum(CLI_KINDS), kind: z.enum(["blueprint", "text_trial"]), requestKey: z.string().min(8).max(64), text: z.string().max(4000).optional() });
const entBody = z.object({ action: z.enum(["grant_dev_trial", "cancel_dev_trial"]) });

const language = async () => ((await getLocale()) === "ar" ? "ar" : "en") as "ar" | "en";

const ROUTES: RouteDef[] = [
  { method: "GET", pattern: ["sessions"], need: "flow.view", handle: async (c) => json({ sessions: await workspaceSessions(c.workspaceId), prototype: prototypeAccess(c.user, c.workspaceId, c.req) }) },
  { method: "POST", pattern: ["sessions"], need: "flow.edit", handle: async (c) => json({ session: await createSession(c.user, c.workspaceId) }, { status: 201 }) },
  {
    method: "GET",
    pattern: ["sessions", ":sid"],
    need: "flow.view",
    handle: async (c) => json({ ...(await sessionOverview(c.workspaceId, c.params[0]!, new URL(c.req.url).searchParams.get("cursor"))), prototype: prototypeAccess(c.user, c.workspaceId, c.req) }),
  },
  {
    method: "DELETE",
    pattern: ["sessions", ":sid"],
    need: "flow.edit",
    handle: async (c) => {
      await requireSession(c.workspaceId, c.params[0]!);
      await deleteSession(c.workspaceId, c.params[0]!);
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: ["sessions", ":sid", "export"],
    need: "flow.view",
    handle: async (c) => {
      const s = await requireSession(c.workspaceId, c.params[0]!);
      const st = stateOf(s);
      return json({ format: "flowline-cb-interview", version: 1, sessionId: s.id, exportedAt: new Date().toISOString(), facts: st.facts, answers: st.answers });
    },
  },
  { method: "POST", pattern: ["sessions", ":sid", "answer"], need: "flow.edit", handle: async (c) => json({ session: (await answer(c.workspaceId, c.params[0]!, await parseBody(c.req, answerBody))).revision }) },
  {
    method: "POST",
    pattern: ["sessions", ":sid", "blueprint"],
    need: "flow.edit",
    handle: async (c) => {
      const r = await generateDeterministic(c.user, c.workspaceId, c.params[0]!, await language());
      return json({ blueprintId: r.row.id, version: r.row.version, created: r.created });
    },
  },
  { method: "POST", pattern: ["blueprints", ":bid", "approve"], need: "flow.edit", handle: async (c) => json({ blueprint: { id: (await approveBlueprint(c.user, c.workspaceId, c.params[0]!)).id } }) },
  {
    method: "POST",
    pattern: ["blueprints", ":bid", "install"],
    need: "agent.edit",
    handle: async (c) => {
      await requireBlueprint(c.workspaceId, c.params[0]!);
      const r = await install(c.user, c.workspaceId, c.params[0]!, { locale: await getLocale() });
      return json({ installationId: r.installation.id, status: r.installation.status, created: r.created, reused: r.reused });
    },
  },
  { method: "POST", pattern: ["installations", ":iid", "cancel"], need: "flow.edit", handle: async (c) => json({ installation: { status: (await cancelInstallation(c.workspaceId, c.params[0]!)).status } }) },
  {
    method: "POST",
    pattern: ["installations", ":iid", "tasks", ":tid", "trial"],
    need: "flow.run",
    handle: async (c) => {
      const b = await parseBody(c.req, trialBody);
      const r = await startTrial(c.user, c.workspaceId, c.params[0]!, c.params[1]!, { trialKey: b.trialKey, input: b.input });
      return json({ trialId: r.trial.id, runId: r.trial.runId, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
    },
  },
  { method: "POST", pattern: ["installations", ":iid", "tasks", ":tid", "activate"], need: "flow.publish", handle: async (c) => json({ reviewItem: await requestActivation(c.user, c.workspaceId, c.params[0]!, c.params[1]!) }) },
  {
    method: "POST",
    pattern: ["installations", ":iid", "tasks", ":tid", "pause"],
    need: "flow.publish",
    handle: async (c) => {
      await pauseTask(c.user, c.workspaceId, c.params[0]!, c.params[1]!);
      return json({ ok: true });
    },
  },
  { method: "GET", pattern: ["trials", ":trid"], need: "flow.view", handle: async (c) => json({ trial: await refreshTrial(c.workspaceId, c.params[0]!) }) },
  { method: "POST", pattern: ["trials", ":trid", "review"], need: "flow.run", handle: async (c) => json({ reviewItem: await requestSampleAction(c.user, c.workspaceId, c.params[0]!) }) },
  { method: "GET", pattern: ["reviews"], need: "flow.view", handle: async (c) => json({ items: await listReviewItems(c.workspaceId, new URL(c.req.url).searchParams.get("status") ?? undefined) }) },
  {
    method: "POST",
    pattern: ["reviews", ":rid"],
    need: "approval.decide",
    handle: async (c) => {
      const b = await parseBody(c.req, decideBody);
      return json({ item: await decideReview(c.user, c.workspaceId, c.params[0]!, b.decision, b.note) });
    },
  },
  { method: "POST", pattern: ["reviews", ":rid", "verify"], need: "approval.decide", handle: async (c) => json(await verifyUncertain(c.user, c.workspaceId, c.params[0]!)) },
  {
    method: "POST",
    pattern: ["entitlement"],
    need: "billing.manage",
    handle: async (c) => {
      const b = await parseBody(c.req, entBody);
      if (b.action === "grant_dev_trial") await grantDevTrial(c.user, c.workspaceId);
      else await cancelDevTrial(c.user, c.workspaceId);
      await reconcileEntitlement(c.workspaceId);
      return json({ ok: true });
    },
  },
  // ─── OWNER_CLI_PROTOTYPE (founder + designated workspace + private host) ───
  { method: "GET", pattern: ["sessions", ":sid", "cli-jobs"], need: "flow.view", prototype: true, handle: async (c) => json({ jobs: await listJobs(c.workspaceId, c.params[0]!) }) },
  {
    method: "POST",
    pattern: ["sessions", ":sid", "cli-jobs"],
    need: "flow.edit",
    prototype: true,
    handle: async (c) => {
      const b = await parseBody(c.req, jobBody);
      const job = await enqueueJob(c.user, c.workspaceId, { sessionId: c.params[0]!, ...b });
      return json({ job: { id: job.id, status: job.status } }, { status: 201 });
    },
  },
  { method: "POST", pattern: ["cli-jobs", ":jid", "cancel"], need: "flow.edit", prototype: true, handle: async (c) => json({ job: { status: (await cancelJob(c.user, c.workspaceId, c.params[0]!)).status } }) },
  { method: "GET", pattern: ["cli-jobs", ":jid", "export"], need: "flow.edit", prototype: true, handle: async (c) => json(await exportJob(c.workspaceId, c.params[0]!)) },
  {
    method: "POST",
    pattern: ["cli-jobs", ":jid", "import"],
    need: "flow.edit",
    prototype: true,
    handle: async (c) => {
      const row = await importJobResult(c.user, c.workspaceId, c.params[0]!, await c.req.json().catch(() => null));
      return json({ blueprintId: row?.id ?? null });
    },
  },
  {
    method: "POST",
    pattern: ["cli-jobs", ":jid", "trial"],
    need: "flow.run",
    prototype: true,
    handle: async (c) => {
      // A completed text-trial job feeds its VALIDATED extraction into the engine as the run input (provenance kept).
      const job = await requireJob(c.workspaceId, c.params[0]!);
      const b = await parseBody(c.req, z.object({ installationId: z.string().uuid(), trialKey: z.string().min(8).max(64) }));
      if (job.kind !== "text_trial" || job.status !== "completed" || !job.result) throw new HttpError(409, "JOB_NOT_READY", "This job has no validated result");
      const env = job.envelope as Envelope;
      const imported = (job.reported as { source?: string } | null)?.source === "imported_claim";
      const r = await startTrial(c.user, c.workspaceId, b.installationId, env.kind === "text_trial" ? env.taskId : "customer-triage", {
        trialKey: b.trialKey,
        input: { request: { ...(job.result as object), channel: "email", sample: true } },
        provenance: imported ? "imported_cli_claim" : "real_cli",
      });
      return json({ trialId: r.trial.id, duplicate: r.duplicate });
    },
  },
];

function match(pattern: string[], path: string[]): string[] | null {
  if (pattern.length !== path.length) return null;
  const params: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i]!.startsWith(":")) params.push(path[i]!);
    else if (pattern[i] !== path[i]) return null;
  }
  return params;
}

export async function dispatch(method: Method, req: Request, wid: string, path: string[]): Promise<Response> {
  assertCompanyBuilderEnabled();
  const user = await requireUser();
  let found: { def: RouteDef; params: string[] } | null = null;
  for (const def of ROUTES) {
    if (def.method !== method) continue;
    const params = match(def.pattern, path);
    if (params) {
      found = { def, params };
      break;
    }
  }
  const { workspace } = await requireWorkspace(user, wid, "viewer");
  if (!found) throw notFound("Not found");
  // Prototype endpoints answer the same 404 to everyone but the founder, before any role check could reveal them.
  if (found.def.prototype) assertPrototypeAccess(user, workspace.id, req);
  await requireWorkspace(user, workspace.id, found.def.need);
  return found.def.handle({ req, params: found.params, user, workspaceId: workspace.id });
}
