// Fresh bounded engine check against the existing immutable v2 packet/scorer; never edits earlier field evidence.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeGraph } from "@/engine/execute";
import { customerFollowUpPack } from "@/company-builder/packs/customer-follow-up";
import { memoryStore } from "../../../../tests/fixtures/company-builder/store-stub";

const field = resolve(process.argv[2] ?? "../FL-wt-field-20261003");
const frozen = resolve(field, "scripts/field-validation/v2");
const { verifyPacket } = await import(pathToFileURL(resolve(frozen, "packet.ts")).href);
const { scoreRequest } = await import(pathToFileURL(resolve(frozen, "scoring.ts")).href);
const { packet, sha256 } = verifyPacket(readFileSync(resolve(frozen, "packet.json")), readFileSync(resolve(frozen, "SHA256SUMS"), "utf8"));
const params = {
  approvedInfo: packet.approvedInformation.join("\n"),
  services: packet.company.services.map((service: string, i: number) => `${service}|${packet.company.servicesArabic[i]}`),
  requiredDetails: packet.company.requiredDetailsBeforeBooking,
  followUpHours: 24, timezone: packet.company.timezone, language: "ar", recordScope: "pilot-product-engine",
};
const graph = customerFollowUpPack.compile(params, (id) => id);
const store = memoryStore();
const scores = [];
for (const request of packet.requests) {
  const input = { request: { id: request.id, from: request.from, received_at: request.receivedAt, subject: request.subject, body: request.body, channel: "email", sample: true } };
  const run = await executeGraph(graph, input, { handler: store.handler });
  const fieldScore = scoreRequest(packet, request.id, run.output);
  const checks = customerFollowUpPack.evaluate(run.output, input, params);
  scores.push({ id: request.id, status: run.status, fieldScore, failedProductChecks: checks.filter((c) => !c.passed).map((c) => c.id) });
}
const result = {
  scope: "synthetic executeGraph plus in-memory data.store; NOT API/worker/browser/provider/human acceptance",
  packetSha256: sha256,
  scorerSha256: createHash("sha256").update(readFileSync(resolve(frozen, "scoring.ts"))).digest("hex"),
  frozenFieldSource: "46a26297ec915d958b16e6c492c5787a24a38ba7",
  passed: scores.every((s) => s.status === "succeeded" && s.fieldScore.passed && s.failedProductChecks.length === 0),
  persistedInMemoryRecords: store.entries.size,
  scores,
};
const name = resolve("artifacts/phase-4/paid-pilot-round1/product", `field-engine-${Date.now()}.json`);
writeFileSync(name, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ passed: result.passed, records: result.persistedInMemoryRecords, scores: scores.map((s) => ({ id: s.id, passed: s.fieldScore.passed, failed: s.fieldScore.failed })), evidence: name }));
if (!result.passed) process.exitCode = 1;
