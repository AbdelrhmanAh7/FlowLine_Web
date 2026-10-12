import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { db, schema } from "@/db";
import { setupUser } from "../../../../../e2e/helpers";
import { comparePersistedRows, compareFollowUpRecords, scoreApprovedAgainstPacket, scoreApprovedOutboxEntry, scoreNoPromise, scoreReviewGate, verifyPacketDigest } from "../../../../../tests/helpers/field-scoring";

/**
 * NEXT-round Flowline field harness (#141): the frozen run's (20261001-d224cfb) spec with its 4 scoring gaps fixed; that run
 * and its recorded evidence stay unchanged. Set FIELD_PACKET_DIR to the new round's directory (packet/ + flowline-field/).
 * Flowline field run of a FROZEN validation packet (sha256 in <dir>/packet/SHA256SUMS). Agent-driven through the real
 * HTTP API of the test stack (deterministic mode, sample-data trials). Scored ONLY against the packet's expectations —
 * Flowline's own evaluator verdict is recorded separately, never used as the score. Failures are kept.
 */
const DIR = process.env.FIELD_PACKET_DIR ?? "";
if (!DIR) throw new Error("FIELD_PACKET_DIR is required (the next round's directory); the frozen run is never re-scored");
// Gap 4 (was :160): verify the packet against SHA256SUMS before anything is scored or recorded.
const digest = verifyPacketDigest(readFileSync(`${DIR}/packet/SHA256SUMS`, "utf8"), (f) => readFileSync(`${DIR}/packet/${f}`));
if (!digest.ok) throw new Error(`packet digest mismatch: ${digest.mismatches.join(", ")}`);
const packet = JSON.parse(readFileSync(`${DIR}/packet/packet.json`, "utf8"));
const OUT = `${DIR}/flowline-field/${process.env.FIELD_RUN ?? "run"}`;
// Run 1 typed services comma-separated (the instruction at the time). From run 2 the product instructs "name / other
// name" for one service, so the answer follows the on-screen instruction.
const SLASH = process.env.FIELD_SERVICES === "slash";

type Json = Record<string, unknown>;
async function poll<T>(fn: () => Promise<T | null>, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("Flowline field run — next round", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const log: Json[] = [];
  const t0 = Date.now();
  const { workspace } = await setupUser(page);
  const req: APIRequestContext = page.request;
  expect((await req.patch(`/api/workspaces/${workspace.id}`, { data: { timezone: packet.company.timezone } })).ok()).toBeTruthy();
  const base = `/api/workspaces/${workspace.id}/company-builder`;
  const sid = (await (await req.post(`${base}/sessions`, { data: {} })).json()).session.id as string;

  // Interview: answer ONLY the questions the product asks, from the packet, until it stops asking.
  const answerFor = (qid: string): unknown => {
    const m: Record<string, unknown> = {
      offering: "I run a small home and office cleaning business in Cairo and Giza. Customer requests arrive by email and follow-up is inconsistent.",
      first_outcome: "customer", situation: "improve", cust_channel: "email", cust_reviewer: "owner",
      cust_details: ["service", "date", "phone"], team: "small", tools: ["gmail"], cust_next: "reply",
      cust_services: SLASH ? packet.company.services.map((x: string, i: number) => `${x} / ${packet.company.servicesArabic[i]}`).join(", ") : [...packet.company.services, ...packet.company.servicesArabic].join(", "),
      cust_info: packet.approvedInformation.join("\n"), cust_volume: "under_20", other_areas: ["none"],
    };
    return qid in m ? m[qid] : "__unknown__";
  };
  const asked: string[] = [];
  let rev = 1;
  for (let i = 0; i < 25; i++) {
    const ov = await (await req.get(`${base}/sessions/${sid}`)).json();
    rev = ov.session.revision;
    const q = ov.session.question;
    if (!q) break;
    asked.push(q.id);
    const v = answerFor(q.id);
    const body = v === "__unknown__" ? { questionId: q.id, unknown: true, revision: rev } : { questionId: q.id, value: v, revision: rev };
    const r = await req.post(`${base}/sessions/${sid}/answer`, { data: body });
    expect(r.ok(), `${q.id}: ${await r.text()}`).toBeTruthy();
  }
  const tPlan0 = Date.now();
  const gen = await (await req.post(`${base}/sessions/${sid}/blueprint`, { data: {} })).json();
  const tPlan = Date.now();
  await req.post(`${base}/blueprints/${gen.blueprintId}/approve`, { data: {} });
  const inst = await (await req.post(`${base}/blueprints/${gen.blueprintId}/install`, { data: {} })).json();
  let ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  const body = ov.blueprint.body;
  await page.goto(`/w/${workspace.slug}/company/${sid}`);
  await expect(page.getByTestId("cb-plan")).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-plan-en.png`, fullPage: true });

  const runOne = async (r: Json, key: string, installationId = inst.installationId as string) => {
    const t = await (await req.post(`${base}/installations/${installationId}/tasks/customer-follow-up/trial`, { data: { trialKey: key, input: { request: { id: r.id, from: r.from, received_at: r.receivedAt, subject: r.subject, body: r.body, channel: "email" } } } })).json();
    const tr = await poll(async () => {
      const x = (await (await req.get(`${base}/trials/${t.trialId}`)).json()).trial;
      return x.status === "completed" ? x : null;
    });
    const run = (await (await req.get(`/api/runs/${tr.runId}`)).json()).run;
    return { trial: tr, output: (run.output ?? {}) as Json, waitMs: new Date(tr.completedAt).getTime() - new Date(tr.createdAt).getTime() };
  };

  const svcEq = (a: unknown, b: unknown) => {
    if (a === b) return true;
    const i = packet.company.services.indexOf(b);
    return i >= 0 && a === packet.company.servicesArabic[i];
  };
  const results: Json[] = [];
  let firstCorrectAt: number | null = null;
  for (const r of packet.requests) {
    const e = packet.expected[r.id];
    const { trial, output, waitMs } = await runOne(r, `field-${r.id}`.replace(/[^A-Za-z0-9_-]/g, ""));
    const reply = output.reply_draft as Json | undefined;
    const person = output.needs_person as Json | undefined;
    const rec = (output.follow_up_record ?? {}) as Json;
    const det = (rec.detected ?? {}) as Json;
    const text = String(reply?.body ?? "");
    const checks: Record<string, boolean> = {};
    if (e.outcome === "hand_off_to_person") {
      checks.outcome = Boolean(person) && !reply;
      const map: Record<string, string> = { complaint: "complaint_needs_person", no_approved_information: "no_approved_information", empty_request: "empty_request" };
      checks.reason = person?.reason === map[e.reason];
    } else {
      checks.outcome = Boolean(reply) && !person;
      checks.recipient = reply?.to === e.recipient;
      checks.reviewRequired = reply?.status === "awaiting_review";
      if ("service" in e) checks.service = svcEq(det.service, e.service);
      if ("date" in e) checks.date = det.date === e.date;
      if ("phone" in e) checks.phone = det.phone === e.phone;
      if (e.phoneDisplay) checks.phoneDisplay = rec.phone_display === e.phoneDisplay;
      if (e.missing && !e.missingAllowed) checks.missing = JSON.stringify(rec.missing) === JSON.stringify(e.missing);
      for (const q of e.mustQuote ?? []) checks[`quotes:${q.slice(0, 24)}`] = text.includes(q);
      if (e.mustQuoteOneOf) checks.quotesPolicy = e.mustQuoteOneOf.some((q: string) => text.includes(q));
      for (const n of e.mustNotContain ?? []) checks[`noInvented:${n}`] = !text.includes(n);
      for (const n of e.mustNotPromise ?? []) checks[`noPromise:${n}`] = scoreNoPromise(text, n, packet.approvedInformation);
      if (e.followUpAt) checks.followUp = new Date(String(rec.next_follow_up_at)).getTime() === new Date(e.followUpAt).getTime();
      if (e.suspiciousFlagged) checks.suspiciousFlagged = reply?.suspicious === true;
      if (e.language) checks.language = reply?.language === e.language;
    }
    checks.consequential = (rec.requires_human_decision === true) === Boolean(e.consequential);
    checks.recordExists = typeof rec.key === "string";
    const passed = Object.values(checks).every(Boolean);
    if (passed && firstCorrectAt === null) firstCorrectAt = Date.now();
    results.push({ id: r.id, trialId: trial.id, passed, failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), checks, flowlineOwnVerdict: trial.verdict?.matchedOutcome ?? null, waitMs, reply: reply ? { to: reply.to, body: text } : null, handoff: person ? person.reason : null, record: rec });
  }

  // Review gate: nothing sent before approval; refund item labelled; the owner's approval puts exactly one text-only entry in the outbox.
  const vp01 = results.find((x) => x.id === "VP-01")!;
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  const outboxBefore = ov.outbox.length;
  // Review the trial that was scored (its id comes from the VP-05 run above), never a re-posted trial that could carry other input.
  const vp05trial = results.find((x) => x.id === "VP-05")!.trialId as string;
  const rev05 = await (await req.post(`${base}/trials/${vp05trial}/review`, { data: {} })).json();
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  const outboxAfterRequest = ov.outbox.length;
  // Gap 2 (was :138): also exercise the approval side.
  const decided = await req.post(`${base}/reviews/${rev05.reviewItem?.id}`, { data: { decision: "approve" } });
  const approvedItem = decided.ok() ? (await decided.json()).item : null;
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  // The entry the approval wrote: recipient, text-only payload and no payment action are scored against the packet's VP-05.
  const sentEntry = (ov.outbox as Json[]).find((x) => x.reviewItemId === rev05.reviewItem?.id);
  const reviewGate = {
    outboxBefore, refundItemStatus: rev05.reviewItem?.status, refundItemConsequential: rev05.reviewItem?.proposed?.consequential ?? null,
    outboxAfterRequestNoApproval: outboxAfterRequest, outboxAfterApproval: ov.outbox.length, statusAfterApproval: approvedItem?.status ?? `http ${decided.status()}`,
    checks: {
      ...scoreReviewGate({ outboxBefore, outboxAfterRequest, statusAfterRequest: rev05.reviewItem?.status, outboxAfterApproval: ov.outbox.length, statusAfterApproval: approvedItem?.status }),
      ...scoreApprovedOutboxEntry(sentEntry, packet.expected["VP-05"].recipient, rev05.reviewItem?.proposed),
      ...scoreApprovedAgainstPacket(sentEntry, packet.expected["VP-05"], packet.approvedInformation),
    },
  };
  // Duplicate check: re-run VP-01 with a new click → same record. Gap 3 (was :143): compare the persisted run records.
  // Persisted state (kv_entry written by the data.store step) is read straight from the test DB before and after the second run.
  const storedFollowUps = async () => (await db.select({ key: schema.kvEntry.key, value: schema.kvEntry.value }).from(schema.kvEntry)
    .where(and(eq(schema.kvEntry.workspaceId, workspace.id), eq(schema.kvEntry.namespace, "cb_customer_follow_ups"))));
  const storedBefore = await storedFollowUps();
  const again = await runOne(packet.requests[0], "field-VP-01-again");
  const storedAfter = await storedFollowUps();
  const duplicateRun = {
    requestsBefore: results.length, storedRowsBefore: storedBefore.length, storedRowsAfter: storedAfter.length,
    ...compareFollowUpRecords(vp01.record, again.output.follow_up_record),
    ...comparePersistedRows(storedBefore, storedAfter, { key: (vp01.record as Json).store_key, value: vp01.record }),
    note: "second VP-01 trial; follow_up_record and the persisted kv_entry rows compared before and after",
  };
  // FC-3 changed answer → reviewable new plan version, then VP-03 quotes the new price.
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  const corr = await req.post(`${base}/sessions/${sid}/answer`, { data: { questionId: "cust_info", value: packet.approvedInformation.map((l: string) => l.replace("900 EGP", "950 EGP")).join("\n"), revision: ov.session.revision, mode: "correction" } });
  expect(corr.ok()).toBeTruthy();
  const gen2 = await (await req.post(`${base}/sessions/${sid}/blueprint`, { data: {} })).json();
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  const fc3: Json = { newVersion: gen2.version, status: ov.blueprint.status, diff: ov.blueprint.diff };
  await req.post(`${base}/blueprints/${gen2.blueprintId}/approve`, { data: {} });
  const inst2 = await (await req.post(`${base}/blueprints/${gen2.blueprintId}/install`, { data: {} })).json();
  const v3 = await runOne(packet.requests[2], "field-FC3-VP-03", inst2.installationId);
  fc3.vp03QuotesNewPrice = String((v3.output.reply_draft as Json)?.body ?? "").includes("950 EGP");
  fc3.vp03NoOldPrice = !String((v3.output.reply_draft as Json)?.body ?? "").includes("900 EGP");

  const metrics = await req.get(`${base}/sessions/${sid}/experiment`);
  const summary = {
    packetSha256: digest.digest, packetDigestVerified: true,
    runAt: new Date().toISOString(),
    mode: "DETERMINISTIC_TEST, sample-data trials through the real worker; agent-driven (times are machine times, NOT human setup time)",
    questionsAsked: asked,
    plan: { tasks: body.tasks.map((t: Json) => t.id), agents: body.tasks.filter((t: Json) => t.kind === "agent").length, roles: body.roles.length, blockers: body.blockers.map((b: Json) => b.code), complete: body.complete, connections: body.tasks.flatMap((t: Json) => (t.connections as Json[]).map((c) => `${c.provider}:${c.status}`)), cost: body.cost },
    timingsMs: { interviewAndPlan: tPlan - t0, planGeneration: tPlan - tPlan0, firstObjectivelyCorrectResultFromStart: firstCorrectAt ? firstCorrectAt - t0 : null, systemWaitingPerTrial: results.map((x) => [x.id, x.waitMs]) },
    score: { passed: results.filter((x) => x.passed).length, total: results.length, failures: results.filter((x) => !x.passed).map((x) => ({ id: x.id, failed: x.failed })) },
    flowlineOwnVerdictDisagreements: results.filter((x) => x.flowlineOwnVerdict !== true).map((x) => x.id),
    reviewGate,
    duplicateRun,
    fc3ChangedAnswer: fc3,
    experimentMetrics: metrics.ok() ? (await metrics.json()).metrics : `experiment mode off (${metrics.status()})`,
    vp01Record: vp01.record,
  };
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ summary, results }, null, 2));
  // Hard assertions run after results.json is written, so a failing gate still leaves its evidence on disk.
  // Explicit assertion: all review-gate checks must pass (recipient match, text-only email_reply, no payment action,
  // quoted approved policy, no promise, consequential flag matches packet VP-05 expectation).
  expect(Object.values(reviewGate.checks).every(Boolean), `review gate checks failed: ${JSON.stringify(reviewGate.checks)}`).toBe(true);
  // Explicit assertion: persisted follow-up rows must be unchanged (same row count, same rows, exactly one
  // follow-up record at the original store_key with the original value) — this catches a regression that
  // adds a second stored row even if the follow_up_record output looks identical.
  const persistedChecks = comparePersistedRows(storedBefore, storedAfter, { key: (vp01.record as Json).store_key, value: vp01.record });
  expect(persistedChecks.sameRowCount, `persisted row count changed: ${storedBefore.length} -> ${storedAfter.length}`).toBe(true);
  expect(persistedChecks.sameRows, "persisted row content changed").toBe(true);
  expect(persistedChecks.exactlyOneFollowUp, "exactly one follow-up record at store_key not preserved").toBe(true);
  await page.reload();
  await page.getByTestId("cb-task-customer-follow-up").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/02-latest-result-en.png`, fullPage: true });
});
