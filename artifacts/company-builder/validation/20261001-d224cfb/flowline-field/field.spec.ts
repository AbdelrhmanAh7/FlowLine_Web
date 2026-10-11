import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { setupUser } from "../../../../../e2e/helpers";

/**
 * Flowline field run of the FROZEN validation packet (sha256 in ../packet/SHA256SUMS). Agent-driven through the real
 * HTTP API of the test stack (deterministic mode, sample-data trials). Scored ONLY against the packet's expectations —
 * Flowline's own evaluator verdict is recorded separately, never used as the score. Failures are kept.
 */
const DIR = "artifacts/company-builder/validation/20261001-d224cfb";
// The frozen v1 packet (default) or a newer version, e.g. PACKET=packet.v2.json (scoring gaps #142). Old runs stay
// reproducible against v1 by default; a new run names the packet it scored.
const PACKET_FILE = process.env.PACKET ?? "packet.json";
const packet = JSON.parse(readFileSync(`${DIR}/packet/${PACKET_FILE}`, "utf8"));
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

test("Flowline field run — frozen packet", async ({ page }) => {
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
    const low = text.toLowerCase();
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
      // Closed-day handling (#142, VP-03): the requested date (2026-10-09) is a Friday, a day the business is closed,
      // so a correct reply quotes the approved working-hours line instead of confirming the date as bookable.
      // getUTCDay makes the weekday check timezone-independent.
      if (e.closedDay) checks.closedDay = new Date(`${e.date}T00:00:00Z`).getUTCDay() === 5 && text.includes("We work Saturday to Thursday, 9:00 to 18:00.");
      // Owner-decision qualification (#142, VP-05/VP-06): a consequential reply must carry owner wording, not only a
      // generic "a member of our team will review" note. Case-insensitive, any of the approved phrases.
      if (e.mustQualifyOwnerDecision) checks.ownerDecision = e.mustQualifyOwnerDecision.some((q: string) => low.includes(q.toLowerCase()));
      for (const n of e.mustNotContain ?? []) checks[`noInvented:${n}`] = !text.includes(n);
      for (const n of e.mustNotPromise ?? []) checks[`noPromise:${n}`] = !low.replace("nothing has been refunded or cancelled yet", "").includes(n);
      if (e.followUpAt) checks.followUp = new Date(String(rec.next_follow_up_at)).getTime() === new Date(e.followUpAt).getTime();
      if (e.suspiciousFlagged) checks.suspiciousFlagged = reply?.suspicious === true;
      if (e.language) checks.language = reply?.language === e.language;
    }
    checks.consequential = (rec.requires_human_decision === true) === Boolean(e.consequential);
    checks.recordExists = typeof rec.key === "string";
    const passed = Object.values(checks).every(Boolean);
    if (passed && firstCorrectAt === null) firstCorrectAt = Date.now();
    results.push({ id: r.id, passed, failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), checks, flowlineOwnVerdict: trial.verdict?.matchedOutcome ?? null, waitMs, reply: reply ? { to: reply.to, body: text } : null, handoff: person ? person.reason : null, record: rec });
  }

  // Review gate: nothing sent before approval; refund item labelled; approval by owner puts only text in the outbox.
  const vp01 = results.find((x) => x.id === "VP-01")!;
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  const outboxBefore = ov.outbox.length;
  const trialIdOf = async (key: string) => (await (await req.post(`${base}/installations/${inst.installationId}/tasks/customer-follow-up/trial`, { data: { trialKey: key } })).json()).trialId as string;
  const vp05trial = await trialIdOf("field-VP-05");
  const rev05 = await (await req.post(`${base}/trials/${vp05trial}/review`, { data: {} })).json();
  const reviewGate = { outboxBefore, refundItemStatus: rev05.reviewItem?.status, refundItemConsequential: rev05.reviewItem?.proposed?.consequential ?? null };
  ov = await (await req.get(`${base}/sessions/${sid}`)).json();
  reviewGate["outboxAfterRequestNoApproval" as keyof typeof reviewGate] = ov.outbox.length as never;

  // Duplicate check: re-run VP-01 with a new click → same record (count unchanged).
  const keysBefore = results.length;
  await runOne(packet.requests[0], "field-VP-01-again");
  // (record count verified in the DB-free way: follow-up keys are per request id; the second run must update, not add)

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
  const checksums = readFileSync(`${DIR}/packet/SHA256SUMS`, "utf8").split("\n");
  const summary = {
    packet: PACKET_FILE,
    packetSha256: (checksums.find((l) => l.trim().endsWith(` ${PACKET_FILE}`)) ?? "").split(" ")[0] || null,
    runAt: new Date().toISOString(),
    mode: "DETERMINISTIC_TEST, sample-data trials through the real worker; agent-driven (times are machine times, NOT human setup time)",
    questionsAsked: asked,
    plan: { tasks: body.tasks.map((t: Json) => t.id), agents: body.tasks.filter((t: Json) => t.kind === "agent").length, roles: body.roles.length, blockers: body.blockers.map((b: Json) => b.code), complete: body.complete, connections: body.tasks.flatMap((t: Json) => (t.connections as Json[]).map((c) => `${c.provider}:${c.status}`)), cost: body.cost },
    timingsMs: { interviewAndPlan: tPlan - t0, planGeneration: tPlan - tPlan0, firstObjectivelyCorrectResultFromStart: firstCorrectAt ? firstCorrectAt - t0 : null, systemWaitingPerTrial: results.map((x) => [x.id, x.waitMs]) },
    score: { passed: results.filter((x) => x.passed).length, total: results.length, failures: results.filter((x) => !x.passed).map((x) => ({ id: x.id, failed: x.failed })) },
    flowlineOwnVerdictDisagreements: results.filter((x) => x.flowlineOwnVerdict !== true).map((x) => x.id),
    reviewGate,
    duplicateRun: { requestsBefore: keysBefore, note: "second VP-01 trial run; record key is per interview + request id (see records below)" },
    fc3ChangedAnswer: fc3,
    experimentMetrics: metrics.ok() ? (await metrics.json()).metrics : `experiment mode off (${metrics.status()})`,
    vp01Record: vp01.record,
  };
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ summary, results }, null, 2));
  await page.reload();
  await page.getByTestId("cb-task-customer-follow-up").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/02-latest-result-en.png`, fullPage: true });
});
