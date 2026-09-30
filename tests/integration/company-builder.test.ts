/**
 * Company Builder — Milestones A–C against real PostgreSQL and the real worker code (engine runs claimed and
 * processed by worker/runner). DETERMINISTIC_TEST mode: no model, no CLI, no external service.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => ({ get: () => undefined }),
}));

import { db, schema } from "@/db";
import { POST as webhookRoute } from "@/app/api/billing/webhook/route";
import { DELETE as cbDELETE, GET as cbGET, POST as cbPOST } from "@/app/api/workspaces/[wid]/company-builder/[...path]/route";
import { startCheckout } from "@/billing/service";
import type { CompanyBlueprint } from "@/company-builder/model";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/server/access";
import { approveBlueprint, generateDeterministic } from "@/server/company-builder/blueprints";
import { cancelDevTrial, effectiveEntitlement, grantDevTrial, reconcileEntitlement } from "@/server/company-builder/entitlement";
import { cancelInstallation, install, installedItems } from "@/server/company-builder/install";
import { sessionOverview } from "@/server/company-builder/overview";
import { decideReview, pauseTask, requestActivation, requestSampleAction, verifyUncertain } from "@/server/company-builder/reviews";
import { reconcileActiveEntitlements } from "@/server/company-builder/entitlement";
import { deleteSession } from "@/server/company-builder/sessions";
import { answer, createSession } from "@/server/company-builder/sessions";
import { refreshTrial, startTrial } from "@/server/company-builder/trials";
import { resetFaults, setFault } from "@/server/faults";
import { saveFlow } from "@/server/flows";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { addMember, claimAndProcess, closeDb, expectHttpError, makeUser, unique } from "./helpers";

let fake: Fake;
beforeAll(async () => {
  process.env.FLOWLINE_COMPANY_BUILDER = "on";
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
  await closeDb();
});
beforeEach(() => {
  process.env.FLOWLINE_COMPANY_BUILDER = "on";
});

const CUSTOMER_PATH: [string, unknown][] = [
  ["situation", "improve"],
  ["offering", "We run a small cleaning company for offices in Riyadh"],
  ["first_outcome", "customer"],
  ["cust_channel", "email"],
  ["cust_reviewer", "owner"],
  ["team", "small"],
  ["tools", ["gmail"]],
  ["cust_next", "reply"],
  ["cust_info", "Our monthly plan price is 300 SAR.\nDelivery of supplies is free inside Riyadh."],
  ["other_areas", ["finance"]],
  ["fin_location", "email"],
  ["fin_currency", ["SAR"]],
  ["fin_reviewer", "owner"],
  ["fin_need", "ledger"],
];

async function answerPath(workspaceId: string, sessionId: string, path: [string, unknown][]) {
  for (const [q, v] of path) {
    const [row] = await db.select({ revision: schema.cbSession.revision }).from(schema.cbSession).where(eq(schema.cbSession.id, sessionId));
    await answer(workspaceId, sessionId, { questionId: q, value: v === "?" ? null : v, unknown: v === "?", revision: row!.revision });
  }
}

/** Owner + workspace + approved plan + installation, ready for trials. */
async function installedCompany(path = CUSTOMER_PATH) {
  const owner = await makeUser("cb-owner");
  const ws = await createWorkspace(owner, unique("CB Co"));
  const session = await createSession(owner, ws.id);
  await answerPath(ws.id, session.id, path);
  const { row: bp } = await generateDeterministic(owner, ws.id, session.id, "en");
  await approveBlueprint(owner, ws.id, bp.id);
  const { installation } = await install(owner, ws.id, bp.id, { locale: "en" });
  return { owner, ws, session, bp, installation };
}

async function runTrial(user: CurrentUser, workspaceId: string, installationId: string, taskId: string, key = unique("trialkey")) {
  const { trial } = await startTrial(user, workspaceId, installationId, taskId, { trialKey: key.replace(/[^A-Za-z0-9_-]/g, "") });
  await claimAndProcess(trial.runId!);
  return refreshTrial(workspaceId, trial.id);
}

describe("Milestone A — interview persistence", () => {
  it("saves every answer durably with optimistic concurrency (a stale tab gets 409, nothing is overwritten)", async () => {
    const owner = await makeUser("cb-a");
    const ws = await createWorkspace(owner, unique("A Co"));
    const s = await createSession(owner, ws.id);
    await answer(ws.id, s.id, { questionId: "situation", value: "start", revision: 1 });
    await expectHttpError(answer(ws.id, s.id, { questionId: "situation", value: "improve", revision: 1 }), 409, "REVISION_CONFLICT");
    const view = await sessionOverview(ws.id, s.id, null);
    expect(view.session.facts.situation).toMatchObject({ value: "start", status: "confirmed", version: 1 });
    expect(view.session.question!.id).toBe("offering"); // resume continues where it stopped
    await expectHttpError(answer(ws.id, s.id, { questionId: "situation", value: "ceo", revision: 2 }), 422);
  });

  it("an unchanged profile doesn't create a new plan version on refresh/double click", async () => {
    const owner = await makeUser("cb-a2");
    const ws = await createWorkspace(owner, unique("A2 Co"));
    const s = await createSession(owner, ws.id);
    await answerPath(ws.id, s.id, CUSTOMER_PATH.slice(0, 5));
    const [a, b] = await Promise.all([generateDeterministic(owner, ws.id, s.id, "en"), generateDeterministic(owner, ws.id, s.id, "en")]);
    expect(a.row.id).toBe(b.row.id);
    const again = await generateDeterministic(owner, ws.id, s.id, "en");
    expect(again.created).toBe(false);
    expect((again.row.body as CompanyBlueprint).complete).toBe(true);
  });
});

describe("Milestone B — real drafts, idempotent installation, sample trials", () => {
  it("creates real draft flows, a knowledge source and a bounded agent — and nothing is published or scheduled", async () => {
    const { ws, installation } = await installedCompany();
    const items = await installedItems(installation.id);
    expect(items.map((i) => `${i.taskId}:${i.kind}`).sort()).toEqual(["customer-answers:agent", "customer-answers:knowledge", "customer-triage:flow", "invoice-organiser:flow"]);
    const flows = await db.select().from(schema.flow).where(eq(schema.flow.workspaceId, ws.id));
    expect(flows).toHaveLength(2);
    expect(flows.every((f) => f.publishedVersionId === null && f.templateId?.startsWith("cb:"))).toBe(true);
    expect(await db.select().from(schema.schedule).where(eq(schema.schedule.workspaceId, ws.id))).toHaveLength(0);
    const [agent] = await db.select().from(schema.agent).where(eq(schema.agent.workspaceId, ws.id));
    const [ver] = await db.select().from(schema.agentVersion).where(eq(schema.agentVersion.id, agent!.currentVersionId!));
    // Least privilege: knowledge_search only, over ITS OWN approved knowledge (finance knowledge never attached).
    expect(ver!.tools).toEqual([{ tool: "knowledge_search", permission: "allow" }]);
    expect(ver!.knowledgeSourceIds).toHaveLength(1);
    expect(ver!.limits.maxToolCalls).toBeLessThanOrEqual(3);
  });

  it("double click, concurrent calls and a crash mid-way never duplicate drafts; the retry resumes", async () => {
    const owner = await makeUser("cb-idem");
    const ws = await createWorkspace(owner, unique("Idem Co"));
    const s = await createSession(owner, ws.id);
    await answerPath(ws.id, s.id, CUSTOMER_PATH);
    const { row: bp } = await generateDeterministic(owner, ws.id, s.id, "en");
    await approveBlueprint(owner, ws.id, bp.id);
    await expect(install(owner, ws.id, bp.id, { locale: "en", crashAfterItems: 1 })).rejects.toThrow("TEST_CRASH_DURING_INSTALL");
    const [failed] = await db.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.blueprintId, bp.id));
    expect(failed!.status).toBe("failed");
    const results = await Promise.all([install(owner, ws.id, bp.id, { locale: "en" }), install(owner, ws.id, bp.id, { locale: "en" }), install(owner, ws.id, bp.id, { locale: "en" })]);
    expect(new Set(results.map((r) => r.installation.id)).size).toBe(1);
    expect(await db.select().from(schema.flow).where(eq(schema.flow.workspaceId, ws.id))).toHaveLength(2);
    expect(await db.select().from(schema.agent).where(eq(schema.agent.workspaceId, ws.id))).toHaveLength(1);
    expect(await installedItems(failed!.id)).toHaveLength(4);
    const again = await install(owner, ws.id, bp.id, { locale: "en" });
    expect(again).toMatchObject({ created: 0, reused: 0 });
  });

  it("installation needs an approved plan; cancelling keeps what exists and refuses to continue", async () => {
    const owner = await makeUser("cb-cancel");
    const ws = await createWorkspace(owner, unique("Cancel Co"));
    const s = await createSession(owner, ws.id);
    await answerPath(ws.id, s.id, CUSTOMER_PATH);
    const { row: bp } = await generateDeterministic(owner, ws.id, s.id, "en");
    await expectHttpError(install(owner, ws.id, bp.id, { locale: "en" }), 409, "BLUEPRINT_NOT_APPROVED");
    await approveBlueprint(owner, ws.id, bp.id);
    await expect(install(owner, ws.id, bp.id, { locale: "en", crashAfterItems: 1 })).rejects.toThrow();
    const [inst] = await db.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.blueprintId, bp.id));
    await cancelInstallation(ws.id, inst!.id);
    await expectHttpError(install(owner, ws.id, bp.id, { locale: "en" }), 409, "INSTALLATION_CANCELLED");
    expect(await installedItems(inst!.id)).toHaveLength(1);
  });

  it("a sample trial runs through the engine and reports structure / run / business result separately", async () => {
    const { owner, ws, installation } = await installedCompany();
    const trial = await runTrial(owner, ws.id, installation.id, "customer-triage");
    expect(trial.status).toBe("completed");
    expect(trial.provenance).toBe("deterministic_calculation");
    expect(trial.verdict).toMatchObject({ structurallyValid: true, ranWithoutErrors: true, matchedOutcome: true });
    const inv = await runTrial(owner, ws.id, installation.id, "invoice-organiser");
    expect(inv.verdict).toMatchObject({ matchedOutcome: true });
    const [run] = await db.select().from(schema.run).where(eq(schema.run.id, inv.runId!));
    // The sample has one discrepancy on purpose: it goes to review, and totals exclude it.
    expect((run!.output as { discrepancy_review?: { discrepancies: unknown[] } }).discrepancy_review?.discrepancies).toHaveLength(1);
  });

  it("the same trial key returns the same trial (refresh never starts a second run)", async () => {
    const { owner, ws, installation } = await installedCompany();
    const a = await startTrial(owner, ws.id, installation.id, "customer-triage", { trialKey: "same-key-123" });
    const b = await startTrial(owner, ws.id, installation.id, "customer-triage", { trialKey: "same-key-123" });
    expect(b).toMatchObject({ duplicate: true });
    expect(b.trial.id).toBe(a.trial.id);
    expect(await db.select().from(schema.run).where(and(eq(schema.run.flowId, a.trial.flowId!), eq(schema.run.triggerRef, "cb-trial:same-key-123")))).toHaveLength(1);
  });

  it("a person's edit that breaks the business result is caught: ran OK, outcome NOT matched", async () => {
    const { owner, ws, installation } = await installedCompany();
    const [item] = (await installedItems(installation.id)).filter((i) => i.taskId === "customer-triage" && i.kind === "flow");
    const [flow] = await db.select().from(schema.flow).where(eq(schema.flow.id, item!.refId));
    const graph = structuredClone(flow!.graph);
    const draft = graph.nodes.find((n) => n.id === "draft")!;
    (draft.data.config as { expression: string }).expression = '{ "from": from, "subject": subject, "topic": topic, "language": language, "suspicious": false, "empty": false, "reply": "We will refund everything!", "used_lines": ["We will refund everything!"] }';
    await saveFlow(owner, flow!.id, { graph, baseRevision: flow!.revision });
    const trial = await runTrial(owner, ws.id, installation.id, "customer-triage");
    expect(trial.verdict).toMatchObject({ structurallyValid: true, ranWithoutErrors: true, matchedOutcome: false });
    expect((trial.verdict as { checks: { id: string; passed: boolean }[] }).checks.find((c) => c.id === "reply_only_approved_info")!.passed).toBe(false);
  });

  it("changed answers create a new plan version with a diff; unchanged tasks are reused, edited drafts are never replaced", async () => {
    const { owner, ws, session, installation } = await installedCompany();
    const [triageItem] = (await installedItems(installation.id)).filter((i) => i.taskId === "customer-triage" && i.kind === "flow");
    const [flow] = await db.select().from(schema.flow).where(eq(schema.flow.id, triageItem!.refId));
    await saveFlow(owner, flow!.id, { name: "My edited triage", baseRevision: flow!.revision });
    const [row] = await db.select({ revision: schema.cbSession.revision }).from(schema.cbSession).where(eq(schema.cbSession.id, session.id));
    await answer(ws.id, session.id, { questionId: "fin_currency", value: ["SAR", "USD"], revision: row!.revision, mode: "correction" });
    const { row: v2 } = await generateDeterministic(owner, ws.id, session.id, "en");
    expect(v2.version).toBe(2);
    expect(v2.diff).toMatchObject({ changedTasks: ["invoice-organiser"], addedTasks: [], removedTasks: [], changedFields: { "invoice-organiser": ["params.currencies"] } });
    await approveBlueprint(owner, ws.id, v2.id);
    const r2 = await install(owner, ws.id, v2.id, { locale: "en" });
    const items2 = await installedItems(r2.installation.id);
    expect(items2.find((i) => i.taskId === "customer-triage")!.origin).toBe("reused");
    expect(items2.find((i) => i.taskId === "customer-triage")!.refId).toBe(flow!.id);
    expect(items2.find((i) => i.taskId === "invoice-organiser" && i.kind === "flow")!.origin).toBe("created");
    const [kept] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow!.id));
    expect(kept!.name).toBe("My edited triage"); // the person's edit survives
    expect(await db.select().from(schema.flow).where(eq(schema.flow.workspaceId, ws.id))).toHaveLength(3); // old invoice flow kept, not overwritten
  });
});

describe("Milestone C — review inbox, activation, entitlement, billing separation", () => {
  it("full journey: trial → test action approved into the sample outbox → activation needs entitlement → active → lapse pauses", async () => {
    const { owner, ws, installation } = await installedCompany();
    const trial = await runTrial(owner, ws.id, installation.id, "customer-triage");
    const item = await requestSampleAction(owner, ws.id, trial.id);
    expect(item).toMatchObject({ kind: "send_sample", status: "pending", reviewerRole: "owner", recipient: "sample.customer@example.com" });
    expect((item.proposed as { body: string }).body).toContain("Our monthly plan price is 300 SAR.");
    const again = await requestSampleAction(owner, ws.id, trial.id);
    expect(again.id).toBe(item.id); // same content → same review item
    const done = await decideReview(owner, ws.id, item.id, "approve");
    expect(done.status).toBe("executed");
    expect(await db.select().from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.workspaceId, ws.id))).toHaveLength(1);

    await expectHttpError(requestActivation(owner, ws.id, installation.id, "customer-triage"), 402, "ENTITLEMENT_REQUIRED");
    await grantDevTrial(owner, ws.id);
    const act = await requestActivation(owner, ws.id, installation.id, "customer-triage");
    const executed = await decideReview(owner, ws.id, act.id, "approve");
    expect(executed.status).toBe("executed");
    const [a] = await db.select().from(schema.cbActivation).where(and(eq(schema.cbActivation.installationId, installation.id), eq(schema.cbActivation.taskId, "customer-triage")));
    expect(a!.state).toBe("active");
    const [flowItem] = (await installedItems(installation.id)).filter((i) => i.taskId === "customer-triage" && i.kind === "flow");
    const [flow] = await db.select().from(schema.flow).where(eq(schema.flow.id, flowItem!.refId));
    expect(flow!.publishedVersionId).not.toBeNull();
    expect(await db.select().from(schema.schedule).where(eq(schema.schedule.flowId, flow!.id))).toHaveLength(0); // manual trigger only
    // The unrelated invoice task is untouched by the customer task's activation.
    const view = await sessionOverview(ws.id, (await db.select().from(schema.cbSession).where(eq(schema.cbSession.workspaceId, ws.id)))[0]!.id, null);
    expect(view.tasks.find((x) => x.task.id === "invoice-organiser")!.status.state).toBe("requires_setup");
    await cancelDevTrial(owner, ws.id);
    const [paused] = await db.select().from(schema.cbActivation).where(eq(schema.cbActivation.id, a!.id));
    expect(paused).toMatchObject({ state: "paused", reason: "entitlement_lapsed" });
    const [unpub] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow!.id));
    expect(unpub!.publishedVersionId).toBeNull();
  });

  it("stale approvals are invalidated: a newer plan version, an edited draft, or a revoked member", async () => {
    const { owner, ws, session, installation } = await installedCompany();
    const trial = await runTrial(owner, ws.id, installation.id, "customer-triage");
    const item = await requestSampleAction(owner, ws.id, trial.id);
    const [row] = await db.select({ revision: schema.cbSession.revision }).from(schema.cbSession).where(eq(schema.cbSession.id, session.id));
    await answer(ws.id, session.id, { questionId: "cust_info", value: "Our monthly plan price is 350 SAR.", revision: row!.revision, mode: "correction" });
    await generateDeterministic(owner, ws.id, session.id, "en");
    const e = await expectHttpError(decideReview(owner, ws.id, item.id, "approve"), 409, "REVIEW_INVALIDATED");
    expect(e.details).toEqual({ reason: "plan_changed" });
    expect(await db.select().from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.reviewItemId, item.id))).toHaveLength(0);

    // Activation bound to the draft's revision: editing the draft afterwards invalidates it.
    const c = await installedCompany();
    await runTrial(c.owner, c.ws.id, c.installation.id, "customer-triage");
    await grantDevTrial(c.owner, c.ws.id);
    const act = await requestActivation(c.owner, c.ws.id, c.installation.id, "customer-triage");
    const [fi] = (await installedItems(c.installation.id)).filter((i) => i.taskId === "customer-triage" && i.kind === "flow");
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, fi!.refId));
    await saveFlow(c.owner, f!.id, { name: "edited after request", baseRevision: f!.revision });
    await expectHttpError(decideReview(c.owner, c.ws.id, act.id, "approve"), 409, "REVIEW_INVALIDATED");

    // Revoked membership: the former editor can no longer decide (not a member → refused).
    const d = await installedCompany();
    const editor = await makeUser("cb-editor");
    await addMember(d.ws.id, editor.id, "editor");
    const t2 = await runTrial(d.owner, d.ws.id, d.installation.id, "customer-triage");
    const it2 = await requestSampleAction(editor, d.ws.id, t2.id);
    await expectHttpError(decideReview(editor, d.ws.id, it2.id, "approve"), 403); // the plan names the OWNER as reviewer
    await db.delete(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, d.ws.id), eq(schema.workspaceMember.userId, editor.id)));
    await expectHttpError(decideReview(editor, d.ws.id, it2.id, "approve"), 403);
  });

  it("concurrent approvals execute once; an uncertain outcome is verified before any retry", async () => {
    const { owner, ws, installation } = await installedCompany();
    const trial = await runTrial(owner, ws.id, installation.id, "customer-triage");
    const item = await requestSampleAction(owner, ws.id, trial.id);
    const settled = await Promise.allSettled([decideReview(owner, ws.id, item.id, "approve"), decideReview(owner, ws.id, item.id, "approve")]);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.reviewItemId, item.id))).toHaveLength(1);

    const c = await installedCompany();
    const t2 = await runTrial(c.owner, c.ws.id, c.installation.id, "invoice-organiser");
    const it2 = await requestSampleAction(c.owner, c.ws.id, t2.id);
    setFault(c.owner.id, "cb_action_lost", 1);
    await expectHttpError(decideReview(c.owner, c.ws.id, it2.id, "approve"), 409, "OUTCOME_UNCERTAIN");
    const [u] = await db.select().from(schema.cbReviewItem).where(eq(schema.cbReviewItem.id, it2.id));
    expect(u!.status).toBe("uncertain");
    const v = await verifyUncertain(c.owner, c.ws.id, it2.id);
    expect(v.verified).toBe("already_applied"); // no blind second send
    expect(await db.select().from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.reviewItemId, it2.id))).toHaveLength(1);
    resetFaults(c.owner.id);
  });

  it("payment events never activate tasks; failed provisioning after payment keeps billing intact; repeated/old events change nothing here", async () => {
    const owner = await makeUser("cb-bill");
    const ws = await createWorkspace(owner, unique("Paid Co"));
    const s = await createSession(owner, ws.id);
    await answerPath(ws.id, s.id, CUSTOMER_PATH);
    const { row: bp } = await generateDeterministic(owner, ws.id, s.id, "en");
    await approveBlueprint(owner, ws.id, bp.id);
    // Real billing flow through the existing abstraction against the provider double.
    const { url } = await startCheckout(owner, ws.id, "test_starter");
    await fetch(`${url}/complete`, { method: "POST", redirect: "manual" });
    const hooks = (await fake.state<{ webhooks: { type: string; payload: string; header: string }[] }>("stripe")).webhooks.filter((w) => w.type === "checkout.session.completed" || w.type === "customer.subscription.created");
    for (const w of hooks) await webhookRoute(new Request("http://flowline.test/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": w.header }, body: w.payload }), undefined);
    // Repeated delivery of the same events.
    for (const w of hooks) await webhookRoute(new Request("http://flowline.test/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": w.header }, body: w.payload }), undefined);
    expect((await effectiveEntitlement(ws.id))?.source).toBe("billing");
    // Payment succeeded + provisioning fails midway: billing status is untouched, nothing is active.
    await expect(install(owner, ws.id, bp.id, { locale: "en", crashAfterItems: 1 })).rejects.toThrow();
    const [acct] = await db.select().from(schema.billingAccount).where(eq(schema.billingAccount.workspaceId, ws.id));
    expect(["trialing", "active"]).toContain(acct!.status);
    expect(await db.select().from(schema.cbActivation).where(eq(schema.cbActivation.workspaceId, ws.id))).toHaveLength(0);
    // Resumed installation still activates nothing by itself.
    await install(owner, ws.id, bp.id, { locale: "en" });
    expect(await db.select().from(schema.cbActivation).where(eq(schema.cbActivation.workspaceId, ws.id))).toHaveLength(0);
    // Billing lapses → entitlement reconciliation pauses whatever had been activated.
    await db.update(schema.billingAccount).set({ status: "canceled" }).where(eq(schema.billingAccount.workspaceId, ws.id));
    expect(await effectiveEntitlement(ws.id)).toBeNull();
    expect(await reconcileEntitlement(ws.id)).toEqual({ paused: 0 });
  });
});

describe("tenancy, feature gate and the HTTP surface", () => {
  async function signIn(user: CurrentUser) {
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(user.id);
    const c = await ssoSessionCookie(session.token);
    return `${c.name}=${encodeURIComponent(c.value)}`;
  }
  async function call(cookie: string | null, method: "GET" | "POST" | "DELETE", wid: string, path: string[], body?: unknown, host = "localhost:3100") {
    sessionHolder.headers = new Headers(cookie ? { cookie } : {});
    const h = { GET: cbGET, POST: cbPOST, DELETE: cbDELETE }[method];
    const req = new Request(`http://${host}/api/workspaces/${wid}/company-builder/${path.join("/")}`, { method, headers: { host, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const res = await h(req, { params: Promise.resolve({ wid, path }) });
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> };
  }

  it("agency: two clients with near-identical names stay isolated; non-members get 404, viewers can't write", async () => {
    const agency = await makeUser("cb-agency");
    const a = await createWorkspace(agency, "Client Nour Trading");
    const b = await createWorkspace(agency, "Client Nour Trading ");
    const sa = await createSession(agency, a.id);
    await answer(a.id, sa.id, { questionId: "situation", value: "client", revision: 1 });
    await answer(a.id, sa.id, { questionId: "client_name", value: "Nour Trading", revision: 2 });
    const cookie = await signIn(agency);
    expect((await call(cookie, "GET", b.id, ["sessions", sa.id])).status).toBe(404); // the other client's workspace can't see it
    const outsider = await makeUser("cb-out");
    expect((await call(await signIn(outsider), "GET", a.id, ["sessions", sa.id])).status).toBe(404);
    const viewer = await makeUser("cb-viewer");
    await addMember(a.id, viewer.id, "viewer");
    const vc = await signIn(viewer);
    expect((await call(vc, "GET", a.id, ["sessions", sa.id])).status).toBe(200);
    expect((await call(vc, "POST", a.id, ["sessions", sa.id, "answer"], { questionId: "offering", value: "x", revision: 3 })).status).toBe(403);
    expect((await call(null, "GET", a.id, ["sessions"])).status).toBe(401);
  });

  it("the whole surface is 404 when the feature flag is off", async () => {
    const u = await makeUser("cb-off");
    const ws = await createWorkspace(u, unique("Off Co"));
    const cookie = await signIn(u);
    process.env.FLOWLINE_COMPANY_BUILDER = "";
    expect((await call(cookie, "GET", ws.id, ["sessions"])).status).toBe(404);
    process.env.FLOWLINE_COMPANY_BUILDER = "on";
    expect((await call(cookie, "GET", ws.id, ["sessions"])).status).toBe(200);
  });

  it("the owner API journey works end to end without any AI key or API account", async () => {
    const u = await makeUser("cb-http");
    const ws = await createWorkspace(u, unique("Http Co"));
    const cookie = await signIn(u);
    const created = await call(cookie, "POST", ws.id, ["sessions"], {});
    const sid = (created.body.session as { id: string }).id;
    let rev = 1;
    for (const [q, v] of CUSTOMER_PATH.slice(0, 9)) {
      const r = await call(cookie, "POST", ws.id, ["sessions", sid, "answer"], { questionId: q, value: v, revision: rev });
      expect(r.status).toBe(200);
      rev = r.body.session as number;
    }
    const gen = await call(cookie, "POST", ws.id, ["sessions", sid, "blueprint"], {});
    const bid = gen.body.blueprintId as string;
    expect((await call(cookie, "POST", ws.id, ["blueprints", bid, "install"], {})).status).toBe(409);
    await call(cookie, "POST", ws.id, ["blueprints", bid, "approve"], {});
    const inst = await call(cookie, "POST", ws.id, ["blueprints", bid, "install"], {});
    expect(inst.body).toMatchObject({ status: "installed", created: 3 });
    const trial = await call(cookie, "POST", ws.id, ["installations", inst.body.installationId as string, "tasks", "customer-triage", "trial"], { trialKey: "http-trial-001" });
    expect(trial.status).toBe(201);
    await claimAndProcess(trial.body.runId as string);
    const overview = await call(cookie, "GET", ws.id, ["sessions", sid]);
    const task = (overview.body.tasks as { task: { id: string }; status: { state: string } }[]).find((x) => x.task.id === "customer-triage")!;
    expect(task.status.state).toBe("sample_verified");
    const aiConnections = await db.select().from(schema.aiConnection).where(eq(schema.aiConnection.workspaceId, ws.id));
    expect(aiConnections).toHaveLength(0);
    const exported = await call(cookie, "GET", ws.id, ["sessions", sid, "export"]);
    expect(exported.body.format).toBe("flowline-cb-interview");
    expect((await call(cookie, "DELETE", ws.id, ["sessions", sid])).status).toBe(200);
    expect((await call(cookie, "GET", ws.id, ["sessions", sid])).status).toBe(404);
    // Drafts are user data and stay after the interview is deleted.
    expect(await db.select().from(schema.flow).where(eq(schema.flow.workspaceId, ws.id))).toHaveLength(1);
  });
});

describe("independent-review fixes (P1/P2 regressions)", () => {
  async function flowOf(installationId: string, taskId: string) {
    const [fi] = (await installedItems(installationId)).filter((i) => i.taskId === taskId && i.kind === "flow");
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, fi!.refId));
    return f!;
  }

  it("P1-4: a paused task can be activated again (a new review is opened)", async () => {
    const { owner, ws, installation } = await installedCompany();
    await runTrial(owner, ws.id, installation.id, "customer-triage");
    await grantDevTrial(owner, ws.id);
    const first = await requestActivation(owner, ws.id, installation.id, "customer-triage");
    await decideReview(owner, ws.id, first.id, "approve");
    await pauseTask(owner, ws.id, installation.id, "customer-triage");
    const second = await requestActivation(owner, ws.id, installation.id, "customer-triage");
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("pending");
    expect((await decideReview(owner, ws.id, second.id, "approve")).status).toBe("executed");
    const [a] = await db.select().from(schema.cbActivation).where(and(eq(schema.cbActivation.installationId, installation.id), eq(schema.cbActivation.taskId, "customer-triage")));
    expect(a!.state).toBe("active");
  });

  it("P1-3: activation requires the trial-verified graph and a manual trigger; nothing unattended is published", async () => {
    const { owner, ws, installation } = await installedCompany();
    await runTrial(owner, ws.id, installation.id, "customer-triage");
    await grantDevTrial(owner, ws.id);
    // Draft changed after the trial (same structure validity, different behaviour) → a new trial is required.
    const f = await flowOf(installation.id, "customer-triage");
    const g = structuredClone(f.graph);
    (g.nodes.find((n) => n.id === "has-answer")!.data.config as { expression: string }).expression = "true";
    await saveFlow(owner, f.id, { graph: g, baseRevision: f.revision });
    await expectHttpError(requestActivation(owner, ws.id, installation.id, "customer-triage"), 409, "SAMPLE_NOT_VERIFIED");
    // Trigger switched to a schedule → never activatable here, even after a matching trial.
    const f2 = await flowOf(installation.id, "customer-triage");
    const g2 = structuredClone(f.graph);
    const trig = g2.nodes.find((n) => n.id === "request")!;
    trig.type = "trigger.schedule";
    trig.data.config = { cron: "0 * * * *", timezone: "UTC", missedPolicy: "skip" } as never;
    await saveFlow(owner, f2.id, { graph: g2, baseRevision: f2.revision });
    const e = await expectHttpError(requestActivation(owner, ws.id, installation.id, "customer-triage"), 409, "NOT_ACTIVATABLE");
    expect(e.details).toEqual({ reason: "not_manual_trigger" });
    expect(await db.select().from(schema.schedule).where(eq(schema.schedule.flowId, f.id))).toHaveLength(0);
  });

  it("P1-5: the worker tick pauses active tasks when the development trial has expired", async () => {
    const { owner, ws, installation } = await installedCompany();
    await runTrial(owner, ws.id, installation.id, "customer-triage");
    await grantDevTrial(owner, ws.id);
    const act = await requestActivation(owner, ws.id, installation.id, "customer-triage");
    await decideReview(owner, ws.id, act.id, "approve");
    await db.update(schema.cbEntitlement).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.cbEntitlement.workspaceId, ws.id));
    expect(await reconcileActiveEntitlements()).toBeGreaterThanOrEqual(1);
    const [a] = await db.select().from(schema.cbActivation).where(eq(schema.cbActivation.installationId, installation.id));
    expect(a).toMatchObject({ state: "paused", reason: "entitlement_lapsed" });
    expect((await flowOf(installation.id, "customer-triage")).publishedVersionId).toBeNull();
  });

  it("P1-6: a complaint that mentions price or refund goes to a person, never an auto-drafted reply", async () => {
    const { owner, ws, installation } = await installedCompany();
    const { trial } = await startTrial(owner, ws.id, installation.id, "customer-triage", { trialKey: "complaint-001", input: { request: { from: "x@example.com", subject: "Order", body: "The item arrived damaged, I paid full price and I want a refund." } } });
    await claimAndProcess(trial.runId!);
    const [run] = await db.select().from(schema.run).where(eq(schema.run.id, trial.runId!));
    expect((run!.output as { needs_person?: { reason: string } }).needs_person?.reason).toBe("complaint_needs_person");
    await expectHttpError(requestSampleAction(owner, ws.id, trial.id), 409, "NOTHING_TO_REVIEW");
  });

  it("P2-1 (verified not reproducible): concurrent trials with the same key create ONE run", async () => {
    const { owner, ws, installation } = await installedCompany();
    const res = await Promise.allSettled([1, 2, 3].map(() => startTrial(owner, ws.id, installation.id, "customer-triage", { trialKey: "race-key-001" })));
    const ok = res.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof startTrial>>> => r.status === "fulfilled");
    expect(new Set(ok.map((r) => r.value.trial.id)).size).toBe(1);
    expect(await db.select().from(schema.run).where(and(eq(schema.run.flowId, ok[0]!.value.trial.flowId!), eq(schema.run.triggerRef, "cb-trial:race-key-001")))).toHaveLength(1);
  });

  it("P2-5/P2-6: a newer plan version doesn't hide installed tasks; deleting the interview withdraws active drafts", async () => {
    const { owner, ws, session, installation } = await installedCompany();
    await runTrial(owner, ws.id, installation.id, "customer-triage");
    await grantDevTrial(owner, ws.id);
    const act = await requestActivation(owner, ws.id, installation.id, "customer-triage");
    await decideReview(owner, ws.id, act.id, "approve");
    const [row] = await db.select({ revision: schema.cbSession.revision }).from(schema.cbSession).where(eq(schema.cbSession.id, session.id));
    await answer(ws.id, session.id, { questionId: "fin_currency", value: ["SAR", "EGP"], revision: row!.revision, mode: "correction" });
    await generateDeterministic(owner, ws.id, session.id, "en");
    const view = await sessionOverview(ws.id, session.id, null);
    expect(view.blueprint!.version).toBe(2);
    expect(view.installation!.id).toBe(installation.id);
    expect(view.tasks.find((t) => t.task.id === "customer-triage")!.status.state).toBe("active");
    const f = await flowOf(installation.id, "customer-triage");
    expect(f.publishedVersionId).not.toBeNull();
    expect(await deleteSession(ws.id, session.id)).toEqual({ unpublished: 1 });
    const [after] = await db.select().from(schema.flow).where(eq(schema.flow.id, f.id));
    expect(after!.publishedVersionId).toBeNull();
    expect(after!.deletedAt).toBeNull(); // the draft itself stays (user data)
  });

  it("P2-8: a draft that gained a step able to reach accounts is refused as a sample trial", async () => {
    const { owner, ws, installation } = await installedCompany();
    const f = await flowOf(installation.id, "customer-triage");
    const g = structuredClone(f.graph);
    g.nodes.push({ id: "call", type: "http.request", position: { x: 1500, y: 120 }, data: { label: "Call", config: { method: "GET", url: '"https://example.com"', headers: "", body: "", timeoutMs: 5000, sideEffect: "none" } } } as never);
    g.edges.push({ id: "ex", source: "reply", target: "call", sourceHandle: "out" });
    await saveFlow(owner, f.id, { graph: g, baseRevision: f.revision });
    await expectHttpError(startTrial(owner, ws.id, installation.id, "customer-triage", { trialKey: "unsafe-0001" }), 409, "TRIAL_NOT_SAMPLE_SAFE");
  });

  it("re-test N1: an already-sent test action is never opened (or sent) again; N3: activating an active task is refused", async () => {
    const { owner, ws, installation } = await installedCompany();
    const trial = await runTrial(owner, ws.id, installation.id, "customer-triage");
    const item = await requestSampleAction(owner, ws.id, trial.id);
    await decideReview(owner, ws.id, item.id, "approve");
    const again = await requestSampleAction(owner, ws.id, trial.id);
    expect(again).toMatchObject({ id: item.id, status: "executed" });
    expect(await db.select().from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.workspaceId, ws.id))).toHaveLength(1);
    await grantDevTrial(owner, ws.id);
    const act = await requestActivation(owner, ws.id, installation.id, "customer-triage");
    await decideReview(owner, ws.id, act.id, "approve");
    await expectHttpError(requestActivation(owner, ws.id, installation.id, "customer-triage"), 409, "ALREADY_ACTIVE");
  });

  it("P3: malformed ids are 404, not 500", async () => {
    const { owner, ws } = await installedCompany();
    await expectHttpError(decideReview(owner, ws.id, "not-a-uuid", "approve"), 404);
    await expectHttpError(refreshTrial(ws.id, "nope"), 404);
    await expectHttpError(cancelInstallation(ws.id, "nope"), 404);
  });
});
