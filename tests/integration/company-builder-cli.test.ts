/**
 * OWNER_CLI_PROTOTYPE boundary and the bounded CLI adapter, using DETERMINISTIC fake CLI executables
 * (tests/fixtures/company-builder/fake-cli.mjs) — no real model inference happens here.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SpawnOptions, SpawnSyncOptions } from "node:child_process";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
const fakeExecutables = vi.hoisted(() => new Map<string, { script: string; mode: string; flavour: string }>());
// Windows cannot execute a Unix shebang with shell:false. Keep real child processes, stdin,
// timeouts and output handling; translate only this suite's registered fixture executables.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const fixtureArgs = (command: string, args: readonly string[], options: SpawnOptions | SpawnSyncOptions) => {
    const fixture = fakeExecutables.get(command);
    return fixture
      ? { command: process.execPath, args: [fixture.script, ...args], options: { ...options, env: { ...options.env, FAKE_MODE: fixture.mode, FAKE_FLAVOUR: fixture.flavour } } }
      : { command, args, options };
  };
  return {
    ...actual,
    spawn: (command: string, args: readonly string[] = [], options: SpawnOptions = {}) => {
      const f = fixtureArgs(command, args, options);
      return actual.spawn(f.command, f.args, f.options as SpawnOptions);
    },
    spawnSync: (command: string, args: readonly string[] = [], options: SpawnSyncOptions = {}) => {
      const f = fixtureArgs(command, args, options);
      return actual.spawnSync(f.command, f.args, f.options as SpawnSyncOptions);
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/company-builder/cli/adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/company-builder/cli/adapter")>();
  return {
    ...actual,
    // Deterministic fixtures must inspect fixture configuration, never the laptop owner's CLI home.
    // The real preflight and its inherited-instruction checks still run.
    preflight: (cli: "claude" | "codex", config: CliConfig) => {
      const result = actual.preflight(cli, config, {
        ...process.env, HOME: config.jobRoot, CODEX_HOME: join(config.jobRoot, ".codex"),
      });
      return result;
    },
  };
});

import { db, schema } from "@/db";
import { GET as cbGET, POST as cbPOST } from "@/app/api/workspaces/[wid]/company-builder/[...path]/route";
import { CliError, readJobFile, type CliConfig } from "@/company-builder/cli/adapter";
import type { CompanyBlueprint } from "@/company-builder/model";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/server/access";
import { approveBlueprint, generateDeterministic } from "@/server/company-builder/blueprints";
import { processJob } from "@/server/company-builder/cli-controller";
import { applyJobResult, cancelJob, claimJob, enqueueJob, exportJob, importJobResult, recoverStaleJobs } from "@/server/company-builder/cli-jobs";
import { answer, createSession } from "@/server/company-builder/sessions";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { addMember, closeDb, expectHttpError, makeUser, unique } from "./helpers";

const FAKE = resolve("tests/fixtures/company-builder/fake-cli.mjs");
let binDir: string;
let jobRoot: string;

function fakeBin(mode: string, flavour: "claude" | "codex" = "claude") {
  const p = join(binDir, `${flavour}-${mode}`);
  if (!existsSync(p)) {
    writeFileSync(p, `#!/bin/sh\nFAKE_MODE=${mode} FAKE_FLAVOUR=${flavour} exec "${process.execPath}" "${FAKE}" "$@"\n`);
    chmodSync(p, 0o755);
  }
  if (process.platform === "win32") fakeExecutables.set(p, { script: FAKE, mode, flavour });
  return p;
}
const cfg = (bin: string, timeoutMs = 10_000): CliConfig => ({ bin, jobRoot, timeoutMs, maxOutputBytes: 64 * 1024 });

let founder: CurrentUser;
let wsId: string;
let sessionId: string;

beforeAll(async () => {
  process.env.FLOWLINE_COMPANY_BUILDER = "on";
  // Claude can set TEMP beneath ~/.claude; that would inherit the owner's CLAUDE.md.
  // Use the standard Windows scratch directory for deterministic isolation fixtures.
  const scratch = process.platform === "win32" && process.env.SystemRoot ? join(process.env.SystemRoot, "Temp") : tmpdir();
  mkdirSync(scratch, { recursive: true });
  binDir = mkdtempSync(join(scratch, "cb-fake-bins-"));
  jobRoot = mkdtempSync(join(scratch, "cb-jobs-"));
  founder = await makeUser("cb-founder");
  const ws = await createWorkspace(founder, unique("Founder Lab"));
  wsId = ws.id;
  const s = await createSession(founder, ws.id);
  sessionId = s.id;
  const path: [string, unknown][] = [["situation", "improve"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_info", "Our monthly plan price is 250 SAR."]];
  for (let i = 0; i < path.length; i++) await answer(ws.id, s.id, { questionId: path[i]![0], value: path[i]![1], revision: i + 1 });
  const { row } = await generateDeterministic(founder, ws.id, s.id, "en");
  await approveBlueprint(founder, ws.id, row.id);
  Object.assign(process.env, { FLOWLINE_CB_PROTOTYPE: "owner_cli", FLOWLINE_CB_FOUNDER_USER_ID: founder.id, FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID: ws.id, FLOWLINE_CB_BOUND: "loopback", FLOWLINE_CB_CODEX_ISOLATION_VERIFIED: "1" });
});
afterAll(async () => {
  for (const k of ["FLOWLINE_CB_PROTOTYPE", "FLOWLINE_CB_FOUNDER_USER_ID", "FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID", "FLOWLINE_CB_BOUND", "FLOWLINE_CB_CODEX_ISOLATION_VERIFIED"]) delete process.env[k];
  rmSync(binDir, { recursive: true, force: true });
  rmSync(jobRoot, { recursive: true, force: true });
  await closeDb();
});

async function signIn(user: CurrentUser) {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const c = await ssoSessionCookie(session.token);
  return `${c.name}=${encodeURIComponent(c.value)}`;
}
async function call(cookie: string, method: "GET" | "POST", wid: string, path: string[], body?: unknown, host = "localhost:3100", extra: Record<string, string> = {}) {
  sessionHolder.headers = new Headers({ cookie });
  const req = new Request(`http://${host}/api/workspaces/${wid}/company-builder/${path.join("/")}`, { method, headers: { host, ...extra, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await (method === "GET" ? cbGET : cbPOST)(req, { params: Promise.resolve({ wid, path }) });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> };
}

async function newJob(kind: "blueprint" | "text_trial" = "blueprint", cli: "claude" | "codex" = "claude") {
  return enqueueJob(founder, wsId, { sessionId, cli, kind, requestKey: unique("req").replace(/[^A-Za-z0-9_-]/g, ""), text: kind === "text_trial" ? "Hi, what's the price? mail me at x@y.com" : undefined });
}
async function runWith(bin: string, kind: "blueprint" | "text_trial" = "blueprint", cli: "claude" | "codex" = "claude", timeoutMs?: number) {
  const job = await newJob(kind, cli);
  const claimed = (await claimJob(wsId, "test-controller"))!;
  expect(claimed.id).toBe(job.id);
  await processJob(claimed, founder, cfg(bin, timeoutMs));
  const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
  return after!;
}

describe("who can reach the CLI prototype", () => {
  it("ordinary owners, editors and outsiders get the same 404 — even with crafted direct requests", async () => {
    const other = await makeUser("cb-owner2");
    const otherWs = await createWorkspace(other, unique("Customer Co"));
    const oc = await signIn(other);
    expect((await call(oc, "POST", otherWs.id, ["sessions", sessionId, "cli-jobs"], { cli: "claude", kind: "blueprint", requestKey: "crafted-0001" })).status).toBe(404);
    const editor = await makeUser("cb-ed");
    await addMember(wsId, editor.id, "owner"); // even a co-OWNER of the prototype workspace is not the founder
    const ec = await signIn(editor);
    expect((await call(ec, "POST", wsId, ["sessions", sessionId, "cli-jobs"], { cli: "claude", kind: "blueprint", requestKey: "crafted-0002" })).status).toBe(404);
    const job = await newJob();
    expect((await call(ec, "POST", wsId, ["cli-jobs", job.id, "cancel"], {})).status).toBe(404);
    expect((await call(ec, "GET", wsId, ["cli-jobs", job.id, "export"])).status).toBe(404);
    const overview = await call(ec, "GET", wsId, ["sessions", sessionId]);
    expect(overview.body.prototype).toEqual({ allowed: false, reason: null });
    await db.update(schema.cbCliJob).set({ status: "cancelled" }).where(eq(schema.cbCliJob.id, job.id));
  });

  it("the founder is refused on a non-private host or through a proxy, and allowed on loopback", async () => {
    const fc = await signIn(founder);
    const body = { cli: "claude", kind: "blueprint", requestKey: "founder-0001" };
    expect((await call(fc, "POST", wsId, ["sessions", sessionId, "cli-jobs"], body, "flowline.example.com")).body).toMatchObject({ error: { code: "PROTOTYPE_UNAVAILABLE", message: "NOT_PRIVATE_HOST" } });
    expect((await call(fc, "POST", wsId, ["sessions", sessionId, "cli-jobs"], body, "localhost:3100", { "x-forwarded-for": "198.51.100.7" })).status).toBe(403);
    const ok = await call(fc, "POST", wsId, ["sessions", sessionId, "cli-jobs"], body);
    expect(ok.status).toBe(201);
    expect(ok.body.job).toMatchObject({ status: "waiting_operator" });
    // Same request key (refresh / retry) → the same job, never a duplicate.
    const again = await call(fc, "POST", wsId, ["sessions", sessionId, "cli-jobs"], body);
    expect((again.body.job as { id: string }).id).toBe((ok.body.job as { id: string }).id);
    const [row] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, (ok.body.job as { id: string }).id));
    // The envelope holds no paths, flags, executables or credentials — only the sanitised brief and catalogue.
    const env = JSON.stringify(row!.envelope);
    for (const bad of ["/usr", "--", "BETTER_AUTH", "DATABASE_URL", "password", "@example.com"]) expect(env).not.toContain(bad);
    await call(fc, "POST", wsId, ["cli-jobs", row!.id, "cancel"], {});
    const [cancelled] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, row!.id));
    expect(cancelled!.status).toBe("cancelled");
  });

  it("the prototype is off unless explicitly enabled in a development build", async () => {
    const fc = await signIn(founder);
    process.env.FLOWLINE_CB_PROTOTYPE = "";
    expect((await call(fc, "POST", wsId, ["sessions", sessionId, "cli-jobs"], { cli: "claude", kind: "blueprint", requestKey: "founder-0002" })).body).toMatchObject({ error: { message: "PROTOTYPE_DISABLED" } });
    process.env.FLOWLINE_CB_PROTOTYPE = "owner_cli";
    process.env.FLOWLINE_BETA_MODE = "invite_only";
    expect((await call(fc, "POST", wsId, ["sessions", sessionId, "cli-jobs"], { cli: "claude", kind: "blueprint", requestKey: "founder-0003" })).body).toMatchObject({ error: { message: "PROTOTYPE_NOT_ALLOWED_IN_BETA" } });
    delete process.env.FLOWLINE_BETA_MODE;
  });
});

describe("controller + adapter with fake CLIs", () => {
  it("a valid Claude-style result becomes a NEW plan version that needs review; usage is only what the CLI reported", async () => {
    const job = await runWith(fakeBin("success"));
    expect(job.status, JSON.stringify({ error: job.error, reported: job.reported })).toBe("review_required");
    expect(job.reported).toMatchObject({ totalCostUsd: 0.0123, inputTokens: 100, outputTokens: 50, calls: 1, models: ["fake-model"] });
    const [bp] = await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.id, job.resultBlueprintId!));
    expect(bp).toMatchObject({ generator: "cli_claude", status: "review_required" });
    expect(job.result).toEqual({ ignoredTaskIds: ["invented-ceo-agent"] }); // an invented task is ignored, never added
    // Outcome first: the proposal can only tune the one planned task; it can't add an agent or another department.
    expect((bp!.body as CompanyBlueprint).tasks.map((t) => t.id)).toEqual(["customer-follow-up"]);
    expect(readdirSync(jobRoot)).toEqual([]); // job directories are removed
  });

  it("Codex-style output file works the same way", async () => {
    const job = await runWith(fakeBin("success", "codex"), "blueprint", "codex");
    expect(job.status).toBe("review_required");
  });

  it("one schema repair at most: invalid→valid passes on the repair, invalid twice fails", async () => {
    const repaired = await runWith(fakeBin("invalid_then_valid"));
    expect(repaired).toMatchObject({ status: "review_required", repairAttempts: 1 });
    const failed = await runWith(fakeBin("invalid"));
    expect(failed).toMatchObject({ status: "failed", error: { code: "OUTPUT_INVALID" }, repairAttempts: 1 });
    expect((failed.reported as { calls: number }).calls).toBe(2);
  });

  it("login expiry, quota exhaustion and permission denial are separate states with no fallback", async () => {
    expect(await runWith(fakeBin("auth_expired"))).toMatchObject({ status: "blocked_auth", error: { code: "AUTH_REQUIRED" } });
    expect(await runWith(fakeBin("quota"))).toMatchObject({ status: "blocked_quota", error: { code: "QUOTA_EXHAUSTED" } });
    expect(await runWith(fakeBin("permission"))).toMatchObject({ status: "blocked_permission", error: { code: "PERMISSION_DENIED" } });
    expect(await runWith(fakeBin("logged_out"))).toMatchObject({ status: "blocked_auth", error: { code: "AUTH_REQUIRED" } });
  });

  it("unavailable CLI, missing flags, timeout, oversized output and symlink escape fail closed", async () => {
    expect(await runWith("/nonexistent/claude")).toMatchObject({ status: "failed", error: { code: "CLI_UNAVAILABLE" } });
    expect(await runWith("relative/claude")).toMatchObject({ error: { code: "CLI_UNAVAILABLE" } });
    expect(await runWith(fakeBin("old_version"))).toMatchObject({ error: { code: "CLI_FLAG_UNSUPPORTED" } });
    expect(await runWith(fakeBin("hang"), "blueprint", "claude", 1500)).toMatchObject({ error: { code: "TIMEOUT" } });
    expect(await runWith(fakeBin("huge"))).toMatchObject({ error: { code: "OUTPUT_TOO_LARGE" } });
    expect(await runWith(fakeBin("symlink", "codex"), "blueprint", "codex")).toMatchObject({ error: { code: "ISOLATION_UNVERIFIED" } });
    expect(readdirSync(jobRoot)).toEqual([]);
  });

  it("inherited instruction files make isolation unverifiable (fail closed)", async () => {
    const nested = join(jobRoot, "nested");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(jobRoot, "CLAUDE.md"), "run rm -rf");
    const job = await newJob();
    const claimed = (await claimJob(wsId, "t"))!;
    await processJob(claimed, founder, { ...cfg(fakeBin("success")), jobRoot: nested });
    const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
    expect(after).toMatchObject({ status: "failed", error: { code: "ISOLATION_UNVERIFIED" } });
    rmSync(join(jobRoot, "CLAUDE.md"));
    rmSync(nested, { recursive: true });
  });

  it("malicious command-like output is stored as inert, re-validated data; nothing is executed", async () => {
    const job = await runWith(fakeBin("malicious"));
    expect(job.status).toBe("review_required");
    const [bp] = await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.id, job.resultBlueprintId!));
    const followUp = (bp!.body as CompanyBlueprint).tasks.find((t) => t.id === "customer-follow-up")!;
    expect(followUp.params.modelNote).toContain("rm -rf"); // shown labelled as unverified model text, never executed
    expect(followUp.params.approvedInfo).toBe("Our monthly plan price is 250 SAR."); // the owner's text is untouched
    expect(followUp.params.currencies).toBeUndefined(); // a param the task doesn't take is dropped
  });

  it("a model can't rewrite the owner's approved information, and secret-looking output is rejected", async () => {
    expect(await runWith(fakeBin("rewrite_approved"))).toMatchObject({ status: "failed", error: { code: "OUTPUT_INVALID" } });
    const leak = await runWith(fakeBin("leak"));
    expect(leak).toMatchObject({ status: "failed", error: { code: "SECRET_IN_OUTPUT" } });
    expect(JSON.stringify(leak)).not.toContain("sk-ant");
  });

  it("Codex stays fail-closed until the operator has verified its isolation", async () => {
    delete process.env.FLOWLINE_CB_CODEX_ISOLATION_VERIFIED;
    expect(await runWith(fakeBin("success", "codex"), "blueprint", "codex")).toMatchObject({ status: "failed", error: { code: "ISOLATION_UNVERIFIED" } });
    process.env.FLOWLINE_CB_CODEX_ISOLATION_VERIFIED = "1";
  });

  it("cancel during generation kills the process group; a dead controller leaves the job INTERRUPTED, not re-run", async () => {
    const job = await newJob();
    const claimed = (await claimJob(wsId, "t2"))!;
    const p = processJob(claimed, founder, cfg(fakeBin("hang"), 30_000));
    await new Promise((r) => setTimeout(r, 800));
    await db.update(schema.cbCliJob).set({ cancelRequestedAt: new Date() }).where(eq(schema.cbCliJob.id, job.id));
    await p;
    const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
    expect(after).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" } });

    const stale = await newJob();
    await db.update(schema.cbCliJob).set({ status: "generating", heartbeatAt: new Date(Date.now() - 600_000) }).where(eq(schema.cbCliJob.id, stale.id));
    await recoverStaleJobs();
    const [rec] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, stale.id));
    expect(rec).toMatchObject({ status: "failed", error: { code: "INTERRUPTED" } });
  });

  it("controller shutdown (SIGINT/SIGTERM signal) kills the running CLI, awaits it, cancels the job and applies nothing", async () => {
    const job = await newJob();
    const before = (await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId))).length;
    const claimed = (await claimJob(wsId, "shutdown-controller"))!;
    const shutdown = new AbortController();
    const started = Date.now();
    const p = processJob(claimed, founder, cfg(fakeBin("hang"), 30_000), shutdown.signal);
    await new Promise((r) => setTimeout(r, 800));
    shutdown.abort();
    await p; // resolves only after the child process has exited
    expect(Date.now() - started).toBeLessThan(15_000); // not the 30 s CLI timeout
    const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
    expect(after).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" }, lockedBy: null, resultBlueprintId: null });
    expect(after!.finishedAt).toBeTruthy();
    expect(await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId))).toHaveLength(before);

    // A signal that arrives before the job starts never spawns the CLI.
    const queued = await newJob();
    const claimed2 = (await claimJob(wsId, "shutdown-controller"))!;
    await processJob(claimed2, founder, cfg(fakeBin("success")), AbortSignal.abort());
    const [early] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, queued.id));
    expect(early).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" }, lockedBy: null });
  });

  it("does not apply a CLI proposal after its base plan has been superseded", async () => {
    const job = await newJob();
    const before = (await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId))).length;
    const [currentSession] = await db.select({ revision: schema.cbSession.revision }).from(schema.cbSession).where(eq(schema.cbSession.id, sessionId));
    await answer(wsId, sessionId, { questionId: "cust_info", value: "Updated after the CLI job was queued.", revision: currentSession!.revision, mode: "correction" });
    const newer = await generateDeterministic(founder, wsId, sessionId, "en");
    const claimed = (await claimJob(wsId, "superseded-controller"))!;
    await processJob(claimed, founder, cfg(fakeBin("success")));
    const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
    expect(after).toMatchObject({ status: "failed", error: { code: "PLAN_SUPERSEDED" }, resultBlueprintId: null });
    expect((await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId)))).toHaveLength(before + 1);
    expect((await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.id, newer.row.id))).length).toBe(1);
  });

  it("rechecks a cancellation in the same transaction that would apply a validated proposal", async () => {
    const job = await newJob();
    const before = (await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId))).length;
    await db.update(schema.cbCliJob).set({ status: "validating" }).where(eq(schema.cbCliJob.id, job.id));
    await cancelJob(founder, wsId, job.id);
    await expectHttpError(applyJobResult(founder, job, { tasks: [{ taskId: "customer-follow-up", include: true, note: "Cancelled", params: {} }], notes: "" }, "cli_claude"), 409, "JOB_CANCELLED");
    const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
    expect(after).toMatchObject({ status: "validating", cancelRequestedAt: expect.any(Date), resultBlueprintId: null });
    expect(await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId))).toHaveLength(before);
  });

  it("readJobFile refuses symlinks and paths outside the job directory", () => {
    const dir = mkdtempSync(join(jobRoot, "probe-"));
    writeFileSync(join(dir, "ok.json"), "{}");
    expect(readJobFile(dir, "ok.json", 100)).toBe("{}");
    expect(() => readJobFile(dir, "../../etc/hostname", 100)).toThrow(CliError);
    rmSync(dir, { recursive: true });
  });

  it("a text trial's validated extraction (personal data sanitised) completes for use as engine input", async () => {
    const job = await runWith(fakeBin("success"), "text_trial");
    expect(job).toMatchObject({ status: "completed", result: { from: "sample@example.com", language: "en" } });
    expect(JSON.stringify(job.envelope)).toContain("[email]");
  });
});

describe("operator export / import (laptop path)", () => {
  it("exports the envelope and imports a validated manifest as a cli_import version; bad manifests are refused", async () => {
    const job = await newJob();
    const exported = await exportJob(wsId, job.id);
    expect(exported.format).toBe("flowline-cb-envelope");
    expect(exported.envelope).not.toHaveProperty("baseBlueprint");
    await expectHttpError(importJobResult(founder, wsId, job.id, { format: "flowline-cb-result", jobId: "someone-else", output: {} }), 422, "MANIFEST_INVALID");
    const bp = await importJobResult(founder, wsId, job.id, { format: "flowline-cb-result", jobId: job.id, output: { tasks: [{ taskId: "customer-follow-up", include: true, note: "Imported from the owner's laptop", params: {} }], notes: "" }, reported: { cliVersion: "2.1.286", secret: "x".repeat(10) } });
    expect(bp).toMatchObject({ generator: "cli_import", status: "review_required" });
    const [after] = await db.select().from(schema.cbCliJob).where(eq(schema.cbCliJob.id, job.id));
    expect(after!.reported).toEqual({ cliVersion: "2.1.286", source: "imported_claim" }); // unknown keys dropped
    const bad = await newJob();
    await expectHttpError(importJobResult(founder, wsId, bad.id, { format: "flowline-cb-result", jobId: bad.id, output: { tasks: [{ taskId: "x", include: true, params: { shell: "rm" } }] } }), 422, "OUTPUT_INVALID");
  });
});
