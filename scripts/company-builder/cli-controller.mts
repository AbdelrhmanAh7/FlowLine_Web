/**
 * OWNER CLI PROTOTYPE controller — run ONLY by the founder, on the founder's own machine, in a private dev build:
 *   node scripts/with-env.mjs .env npx tsx scripts/company-builder/cli-controller.mts
 * It processes Company Builder CLI jobs of the designated prototype workspace, one at a time, with the CLIs'
 * own official logins (never copied, never read by Flowline). Stop with Ctrl+C: the running job's process group is
 * killed and the job ends as cancelled/interrupted (never re-run silently). The shared worker never runs these jobs.
 */
import { and, eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { prototypeConfigProblem } from "@/server/company-builder/gate";
import { claimJob, recoverStaleJobs } from "@/server/company-builder/cli-jobs";
import { processJob } from "@/server/company-builder/cli-controller";

// The controller serves no HTTP (it only reads jobs from the database), so the web server's bind marker doesn't apply.
const problem = prototypeConfigProblem({ ...process.env, FLOWLINE_CB_BOUND: "loopback" });
if (problem) {
  console.error(`[cb-controller] refusing to start: ${problem}`);
  process.exit(2);
}
const workspaceId = process.env.FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID!;
const founderId = process.env.FLOWLINE_CB_FOUNDER_USER_ID!;
const [founder] = await db.select({ id: schema.user.id, email: schema.user.email, name: schema.user.name }).from(schema.user).where(eq(schema.user.id, founderId));
const [member] = founder ? await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.userId, founderId), eq(schema.workspaceMember.workspaceId, workspaceId))) : [];
if (!founder || !member) {
  console.error("[cb-controller] refusing to start: founder user or membership not found");
  process.exit(2);
}
const controllerId = `cb-controller-${process.pid}`;
const shutdown = new AbortController();
// The first signal stops claiming and aborts the running job (its CLI process group is killed and awaited below).
const stop = () => shutdown.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`[cb-controller] ${controllerId} watching workspace ${workspaceId} (one job at a time)`);
const stale = await recoverStaleJobs(workspaceId);
if (stale.length) console.log(`[cb-controller] marked ${stale.length} interrupted job(s) as failed`);
while (!shutdown.signal.aborted) {
  const job = await claimJob(workspaceId, controllerId);
  if (!job) {
    await new Promise<void>((r) => {
      const t = setTimeout(r, 2000);
      shutdown.signal.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
    });
    continue;
  }
  console.log(`[cb-controller] job ${job.id} (${job.cli}/${job.kind}) started`);
  await processJob(job, founder, undefined, shutdown.signal);
  const [after] = await db.select({ status: schema.cbCliJob.status, error: schema.cbCliJob.error }).from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
  console.log(`[cb-controller] job ${job.id} → ${after?.status}${after?.error ? ` (${after.error.code})` : ""}`);
}
await pool.end();
