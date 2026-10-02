import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { signUpVerified, uniqueEmail } from "../../../e2e/helpers";
import { loadPacket } from "./packet";
import { assertFieldDatabase } from "./isolation";
import { scoreApprovalGate, scoreDuplicate, scoreRequest, type Json, type OutboxRow, type StoredRecord } from "./scoring";

// Derived from 719056c:artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.spec.ts.
// Scores never import the product evaluator or accept its matchedOutcome as an oracle.
test("v2 field packet through real API/worker and persisted storage (sample only)", async ({ request }) => {
  const { packet, sha256 } = loadPacket(); // Must succeed BEFORE any side effect or score is recorded.
  const databaseUrl = process.env.DATABASE_URL;
  assertFieldDatabase(databaseUrl, process.env.FLOWLINE_ENV);
  const runName = process.env.FIELD_RUN;
  if (!runName || !/^[A-Za-z0-9_-]{1,80}$/.test(runName)) throw new Error("FIELD_RUN must name a new bounded run");
  const out = resolve("artifacts/phase-4/takeover-20261003/field/runs", runName);
  mkdirSync(out, { recursive: false }); // Parent prepared by operator; refuse existing run/evidence overwrite.
  const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
  const client = new Client({ connectionString: databaseUrl });
  try { await client.connect(); } catch { await client.end(); throw new Error("Field test database connection failed"); }
  try {
    await client.query("SET default_transaction_read_only = on");
    const json = async (method: "get" | "post" | "patch", url: string, data?: unknown): Promise<Json> => {
      const response = await request[method](url, data === undefined ? {} : { data });
      if (!response.ok()) throw new Error(`Field API ${method} failed (${response.status()})`); // No response/credential dump.
      return response.json();
    };
    await signUpVerified(request, uniqueEmail("field-v2"));
    const ws = (await json("post", "/api/workspaces", { name: "Synthetic field validation v2" })).workspace as { id: string };
    await json("post", "/api/onboarding", { goal: "sales", skipped: false });
    await json("patch", `/api/workspaces/${ws.id}`, { timezone: packet.company.timezone });
    const base = `/api/workspaces/${ws.id}/company-builder`;
    const session = (await json("post", `${base}/sessions`, {})).session as { id: string };
    const answers: Json = {
      offering: packet.company.description, first_outcome: "customer", situation: "improve", cust_channel: "email", cust_reviewer: "owner",
      cust_details: ["service", "date", "phone"], team: "small", tools: ["gmail"], cust_next: "reply",
      cust_services: packet.company.services.map((service, i) => `${service} / ${packet.company.servicesArabic[i]}`).join(", "),
      cust_info: packet.approvedInformation.join("\n"), cust_volume: "under_20", other_areas: ["none"],
    };
    let interviewFinished = false;
    for (let i = 0; i < 25; i++) {
      const current = (await json("get", `${base}/sessions/${session.id}`)).session as { revision: number; question?: { id: string } };
      if (!current.question) { interviewFinished = true; break; }
      const questionId = current.question.id;
      await json("post", `${base}/sessions/${session.id}/answer`, { questionId, revision: current.revision, ...(questionId in answers ? { value: answers[questionId] } : { unknown: true }) });
    }
    expect(interviewFinished, "bounded interview completed").toBe(true);
    const blueprint = await json("post", `${base}/sessions/${session.id}/blueprint`, {});
    await json("post", `${base}/blueprints/${blueprint.blueprintId}/approve`, {});
    const installation = await json("post", `${base}/blueprints/${blueprint.blueprintId}/install`, {});
    const runOne = async (input: PacketRequest, key: string) => {
      const started = await json("post", `${base}/installations/${installation.installationId}/tasks/customer-follow-up/trial`, {
        trialKey: key, input: { request: { id: input.id, from: input.from, received_at: input.receivedAt, subject: input.subject, body: input.body, channel: "email", sample: true } },
      });
      const trial = await pollTrial(request, `${base}/trials/${started.trialId}`);
      const run = (await json("get", `/api/runs/${trial.runId}`)).run as Json;
      expect(run.status).toBe("succeeded");
      return { trial, output: (run.output ?? {}) as Json };
    };
    const records = async (): Promise<StoredRecord[]> => {
      const rows = await client.query<StoredRecord>("SELECT key, value FROM kv_entry WHERE workspace_id = $1 AND namespace = $2 ORDER BY key", [ws.id, "cb_customer_follow_ups"]);
      return rows.rows; // Real read-only DB query, never result/output keys substituted for persisted rows.
    };
    const outbox = async () => (await json("get", `${base}/sessions/${session.id}`)).outbox as OutboxRow[];
    const initialOutbox = await outbox();
    const results = [];
    for (const input of packet.requests) {
      const result = await runOne(input, `field-v2-${input.id}`);
      results.push({ id: input.id, trialId: result.trial.id, output: result.output, score: scoreRequest(packet, input.id, result.output), flowlineOwnVerdict: (result.trial.verdict as Json | null)?.matchedOutcome ?? null });
    }
    const beforeRecords = await records();
    await runOne(packet.requests[0]!, "field-v2-VP-01-again");
    const afterRecords = await records();
    const duplicate = scoreDuplicate(beforeRecords, afterRecords, "VP-01", `${session.id}/sample:VP-01`);
    const vp05 = results.find((result) => result.id === "VP-05")!;
    const review = (await json("post", `${base}/trials/${vp05.trialId}/review`, {})).reviewItem as Json;
    const pending = await outbox();
    const approved = (await json("post", `${base}/reviews/${review.id}`, { decision: "approve" })).item as Json;
    const after = await outbox();
    const replay = await request.post(`${base}/reviews/${review.id}`, { data: { decision: "approve" } });
    const afterReplay = await outbox();
    const gateEvidence = { before: initialOutbox, pending, after, afterReplay, review, approved, replayStatus: replay.status(), expectedRecipient: packet.requests.find((r) => r.id === "VP-05")!.from, expectedBody: String((vp05.output.reply_draft as Json).body ?? "") };
    const approvalGate = scoreApprovalGate(gateEvidence);
    const allRecordsPresent = packet.requests.every((input) => afterRecords.filter((row) => row.value.request_id === input.id && row.key === `${session.id}/sample:${input.id}`).length === 1) && afterRecords.length === packet.requests.length;
    const summary = {
      packetVersion: packet.version, packetSha256: sha256, codeSha, dirty, runAt: new Date().toISOString(),
      mode: "REAL_TEST_API_AND_WORKER_SAMPLE_ONLY", liveProviderVerification: "NOT_RUN", humanAcceptance: "NOT_RUN",
      score: { passed: results.filter((r) => r.score.passed).length, total: results.length },
      duplicate, approvalGate, allRecordsPresent,
      passed: results.every((r) => r.score.passed) && duplicate.passed && approvalGate.passed && allRecordsPresent,
      limitations: ["No browser/UI coverage", "Local sample outbox only; no Gmail delivery, payment or cancellation-provider proof", "FC-1/FC-3/FC-4 not exercised by this bounded scoring run", "Known packet; not held-out"],
    };
    // Failures are saved first and then fail the suite, unlike v1's report-only scoring.
    writeFileSync(resolve(out, "results.json"), JSON.stringify({ summary, results, duplicateEvidence: { before: beforeRecords, after: afterRecords }, gateEvidence }, null, 2), { flag: "wx" });
    expect(summary.passed, "independent packet and universal checks").toBe(true);
  } finally {
    await client.end();
  }
});

type PacketRequest = ReturnType<typeof loadPacket>["packet"]["requests"][number];
async function pollTrial(request: APIRequestContext, url: string): Promise<Json> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await request.get(url);
    if (!response.ok()) throw new Error(`Field trial poll failed (${response.status()})`);
    const trial = (await response.json()).trial as Json;
    if (trial.status === "completed") return trial;
    if (trial.status === "failed") throw new Error("Field trial failed");
    await new Promise((done) => setTimeout(done, 300)); // Polling only, never reruns a trial.
  }
  throw new Error("Field trial timed out");
}
