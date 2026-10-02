import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { CliError, cliConfig, parseJsonOutput, preflight, runCli, type CliConfig, type CliErrorCode } from "@/company-builder/cli/adapter";
import { MAX_REPAIRS, type CliKind } from "@/company-builder/cli/envelope";
import type { CurrentUser } from "@/server/access";
import { HttpError } from "@/server/http";
import { applyJobResult, cliEnvelope, validateJobOutput } from "./cli-jobs";

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
    .where(and(eq(schema.cbCliJob.id, jobId), ne(schema.cbCliJob.status, "cancelled")));
}

/**
 * `shutdown` is the controller's own stop signal (SIGINT/SIGTERM). It kills the running CLI's process group, is awaited
 * to completion, and ends the job as cancelled (never re-run silently); a result is never applied once it fires.
 */
export async function processJob(job: typeof schema.cbCliJob.$inferSelect, founder: CurrentUser, cfgOverride?: CliConfig, shutdown?: AbortSignal) {
  const cli = job.cli as CliKind;
  const envelope = cliEnvelope(job.envelope);
  const cfg = cfgOverride ?? cliConfig(cli);
  if (shutdown?.aborted) return finish(job.id, "CANCELLED");
  const pf = preflight(cli, cfg);
  if (!pf.ok) return finish(job.id, pf.code ?? "CLI_UNAVAILABLE", { cliVersion: pf.version, missingFlags: pf.missingFlags, isolation: pf.isolation.length });

  const ac = new AbortController();
  const onShutdown = () => ac.abort();
  shutdown?.addEventListener("abort", onShutdown, { once: true });
  if (shutdown?.aborted) onShutdown();
  const code = (e: unknown): CliErrorCode => (shutdown?.aborted ? "CANCELLED" : e instanceof CliError ? e.code : "CLI_FAILED");
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
        return finish(job.id, code(e), reported);
      }
      if (shutdown?.aborted) return finish(job.id, "CANCELLED", reported); // fence: a stopped controller applies nothing
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
      if (shutdown?.aborted) return finish(job.id, "CANCELLED", reported);
      try {
        await applyJobResult(founder, job, check.value, cli === "claude" ? "cli_claude" : "cli_codex");
      } catch (e) {
        // A proposal that parses but produces an invalid plan is rejected as a whole (nothing partial is stored).
        if (e instanceof HttpError && e.code === "JOB_CANCELLED") return finish(job.id, "CANCELLED", reported);
        if (e instanceof HttpError && e.code === "PLAN_SUPERSEDED") return finish(job.id, "PLAN_SUPERSEDED", reported);
        return finish(job.id, "OUTPUT_INVALID", reported);
      }
      await db.update(schema.cbCliJob).set({ reported, lockedBy: null }).where(eq(schema.cbCliJob.id, job.id));
      return;
    }
    return finish(job.id, "OUTPUT_INVALID", reported);
  } finally {
    clearInterval(beat);
    shutdown?.removeEventListener("abort", onShutdown);
  }
}
