/**
 * Operator export/import path (brief §4): run on the founder's LAPTOP when the CLI can't run where Flowline runs
 * (e.g. the Pi). Input: the envelope exported from the Company Builder page. Output: a result manifest to import
 * on the same page. Uses the laptop CLI's own official login; no credentials are read, copied or written.
 *
 *   FLOWLINE_CB_CLAUDE_BIN=$(command -v claude) npx tsx scripts/company-builder/laptop-generate.mts envelope.json result.json
 *   FLOWLINE_CB_CODEX_BIN=$(command -v codex)   npx tsx scripts/company-builder/laptop-generate.mts envelope.json result.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CliError, cliConfig, parseJsonOutput, preflight, runCli } from "@/company-builder/cli/adapter";
import { blueprintProposalSchema, envelopeSchema, MAX_REPAIRS, textTrialResultSchema } from "@/company-builder/cli/envelope";

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error("usage: laptop-generate.mts <envelope.json> <result.json>");
  process.exit(2);
}
const exported = JSON.parse(readFileSync(inFile, "utf8")) as { format?: string; envelope?: unknown };
if (exported.format !== "flowline-cb-envelope") throw new Error("Not a Flowline Company Builder envelope");
const envelope = envelopeSchema.parse(exported.envelope);
const cfg = cliConfig(envelope.cli);
const pf = preflight(envelope.cli, cfg);
console.log(JSON.stringify({ cli: envelope.cli, version: pf.version, auth: pf.auth, missingFlags: pf.missingFlags, isolationFiles: pf.isolation }, null, 2));
if (!pf.ok) {
  console.error(`BLOCKED: ${pf.code}`);
  process.exit(3);
}
const schema = envelope.kind === "blueprint" ? blueprintProposalSchema : textTrialResultSchema;
let repairOf: { output: string; problem: string } | undefined;
const reported: Record<string, unknown> = { cliVersion: pf.version, calls: 0 };
for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
  let run;
  try {
    run = await runCli(envelope.cli, envelope, cfg, { repairOf });
  } catch (e) {
    console.error(`FAILED: ${e instanceof CliError ? e.code : String(e)}`);
    process.exit(4);
  }
  reported.calls = (reported.calls as number) + 1;
  Object.assign(reported, run.reported);
  let raw: unknown;
  try {
    raw = parseJsonOutput(run.output);
  } catch {
    repairOf = { output: run.output, problem: "not valid JSON" };
    continue;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    repairOf = { output: run.output, problem: parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join("; ") };
    continue;
  }
  writeFileSync(outFile, JSON.stringify({ format: "flowline-cb-result", jobId: envelope.jobId, output: parsed.data, reported }, null, 2));
  console.log(`OK: wrote ${outFile} (${reported.calls} call(s)). Import it on the Company Builder page.`);
  process.exit(0);
}
console.error("FAILED: OUTPUT_INVALID after one repair");
process.exit(5);
