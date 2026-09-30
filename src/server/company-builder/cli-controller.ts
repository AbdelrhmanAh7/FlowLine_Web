import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CliError, cliConfig, parseJsonOutput, preflight, runCli, type CliConfig, type CliErrorCode } from "@/company-builder/cli/adapter";
import { MAX_REPAIRS, type CliKind, type Envelope } from "@/company-builder/cli/envelope";
import type { CurrentUser } from "@/server/access";
import { applyJobResult, validateJobOutput } from "./cli-jobs";

/**
 * Processes ONE claimed job: preflight → run → validate → (at most one repair) → apply. Status transitions are
 * durable; the web request that enqueued the job returned long ago. Nothing here retries on auth/quota/permission
 * errors, switches accounts or falls back to a paid API.
 */

const STATUS_FOR: Partial<Record<CliErrorCode, string>> = { AUTH_REQUIRED: "blocked_auth", QUOTA_EXHAUSTED: "blocked_quota", PERMISSION_DENIED: "blocked_permission" };

async function finish(jobId: string, code: CliErrorCode, reported?: Record<string, unknown>) {
  await db
    .update(schema.cbCliJob)
    .set({ status: code === "CANCELLED" ? "cancelled" : (STATUS_FOR[code] ?? "failed"), error: { code }, finishedAt: new Date(), lockedBy: null, ...(reported ? { reported } : {}) })
    .where(eq(schema.cbCliJob.id, jobId));
}

export async function processJob(job: typeof schema.cbCliJob.$inferSelect, founder: CurrentUser, cfgOverride?: CliConfig) {
  const cli = job.cli as CliKind;
  const envelope = job.envelope as Envelope;
  const cfg = cfgOverride ?? cliConfig(cli);
  const pf = preflight(cli, cfg);
  if (!pf.ok) return finish(job.id, pf.code ?? "CLI_UNAVAILABLE", { cliVersion: pf.version, missingFlags: pf.missingFlags, isolation: pf.isolation.length });

  const ac = new AbortController();
  const beat = setInterval(() => {
    void db
      .select({ c: schema.cbCliJob.cancelRequestedAt })
      .from(schema.cbCliJob)
      .where(eq(schema.cbCliJob.id, job.id))
      .then(([r]) => {
        if (r?.c) ac.abort();
      })
      .catch(() => {});
    void db.update(schema.cbCliJob).set({ heartbeatAt: new Date() }).where(eq(schema.cbCliJob.id, job.id)).catch(() => {});
  }, 2000);

  const reported: Record<string, unknown> = { cliVersion: pf.version, calls: 0 };
  try {
    let repairOf: { output: string; problem: string } | undefined;
    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      if (attempt > 0) await db.update(schema.cbCliJob).set({ repairAttempts: attempt, status: "generating" }).where(eq(schema.cbCliJob.id, job.id));
      let result;
      try {
        result = await runCli(cli, envelope, cfg, { signal: ac.signal, repairOf });
      } catch (e) {
        return finish(job.id, e instanceof CliError ? e.code : "CLI_FAILED", reported);
      }
      reported.calls = (reported.calls as number) + 1;
      Object.assign(reported, result.reported);
      await db.update(schema.cbCliJob).set({ status: "validating", reported }).where(eq(schema.cbCliJob.id, job.id));
      let raw: unknown;
      try {
        raw = parseJsonOutput(result.output);
      } catch {
        repairOf = { output: result.output, problem: "not valid JSON" };
        continue;
      }
      const check = validateJobOutput(envelope, raw);
      if (!check.ok) {
        repairOf = { output: result.output, problem: check.problem };
        continue;
      }
      try {
        await applyJobResult(founder, job, check.value, cli === "claude" ? "cli_claude" : "cli_codex");
      } catch {
        // A proposal that parses but produces an invalid plan is rejected as a whole (nothing partial is stored).
        return finish(job.id, "OUTPUT_INVALID", reported);
      }
      await db.update(schema.cbCliJob).set({ reported, lockedBy: null }).where(eq(schema.cbCliJob.id, job.id));
      return;
    }
    return finish(job.id, "OUTPUT_INVALID", reported);
  } finally {
    clearInterval(beat);
  }
}
