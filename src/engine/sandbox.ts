import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { EXPRESSION_MAX_DEPTH, EXPRESSION_MAX_LENGTH, EXPRESSION_TIMEOUT_MS, ExpressionError, VALUE_MAX_BYTES } from "./expression";

/** Heap cap for the sandbox process. */
export const SANDBOX_HEAP_MB = 128;

const CHILD = fileURLToPath(new URL("./sandbox-child.mjs", import.meta.url));

type Reply = { id: number; ok: true; json: string } | { id: number; ok: false; code: string; message: string };

let child: ChildProcess | null = null;
let nextId = 1;
let queue: Promise<unknown> = Promise.resolve();

function spawnChild() {
  // Parsing needs no worker credentials, proxy configuration, PATH or Node preload hooks.
  // This reduces environment exposure; it does not confine filesystem/network/OS authority.
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  // libuv on Windows otherwise silently copies these omitted names from the parent.
  if (process.platform === "win32") {
    for (const key of ["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "PATH", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR"]) env[key] = "";
    // Node requires this OS installation path on Windows to initialize its runtime.
    env.SYSTEMROOT = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "";
  }
  if (process.env.FLOWLINE_ENV === "test") env.FLOWLINE_SANDBOX_TEST_INSPECTION = "1";
  const c = fork(CHILD, [], { env, cwd: dirname(CHILD), execArgv: [`--max-old-space-size=${SANDBOX_HEAP_MB}`], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  c.on("exit", () => {
    if (child === c) child = null;
  });
  c.on("error", () => {});
  return c;
}

function once(source: string, input: unknown, bindings: Record<string, unknown> | undefined, timeoutMs: number, extra?: Record<string, unknown>): Promise<unknown> {
  child ??= spawnChild();
  const c = child;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      c.off("message", onMessage);
      c.off("exit", onExit);
    };
    const onMessage = (m: Reply) => {
      if (m.id !== id) return;
      cleanup();
      if (m.ok) resolve(JSON.parse(m.json));
      else reject(new ExpressionError(m.code, m.message));
    };
    const onExit = (code: number | null, signal: string | null) => {
      cleanup();
      reject(new ExpressionError("EXPRESSION_MEMORY", `Expression evaluation was stopped (exceeded the ${SANDBOX_HEAP_MB}MB sandbox or crashed: ${signal ?? code})`));
    };
    const timer = setTimeout(() => {
      cleanup();
      c.kill("SIGKILL"); // a fresh sandbox is spawned for the next evaluation
      if (child === c) child = null;
      reject(new ExpressionError("EXPRESSION_TIMEOUT", `Expression took longer than ${timeoutMs}ms`));
    }, timeoutMs);
    c.on("message", onMessage);
    c.on("exit", onExit);
    c.send({ id, source, input, bindings, maxDepth: EXPRESSION_MAX_DEPTH, maxBytes: VALUE_MAX_BYTES, ...extra });
  });
}

/**
 * Server-side (execution worker) evaluator. Runs JSONata in a separate, heap-capped
 * process with a hard kill on timeout, so no expression (runaway built-in,
 * catastrophic regex, huge allocation) can stall or crash the worker itself.
 * Evaluations are serialized through one sandbox process.
 */
export function evaluateIsolated(source: string, input: unknown, bindings?: Record<string, unknown>, timeoutMs = EXPRESSION_TIMEOUT_MS): Promise<unknown> {
  if (source.length > EXPRESSION_MAX_LENGTH) {
    return Promise.reject(new ExpressionError("EXPRESSION_TOO_LONG", `Expression is longer than ${EXPRESSION_MAX_LENGTH} characters`));
  }
  const run = queue.then(() => once(source, input, bindings, timeoutMs));
  queue = run.catch(() => {});
  return run;
}

/** Extracts text from an untrusted PDF inside the sandbox process (heap-capped, killed on timeout). */
export function extractPdfTextIsolated(base64: string, timeoutMs = 20_000): Promise<{ text: string; pages: number }> {
  const run = queue.then(() => once("", null, undefined, timeoutMs, { op: "pdf_text", base64 }));
  queue = run.catch(() => {});
  return run as Promise<{ text: string; pages: number }>;
}

/** Test-only real-child proof. Returns nonempty variable names, never their values. */
export function sandboxEnvironmentKeysForTest(): Promise<string[]> {
  if (process.env.FLOWLINE_ENV !== "test") return Promise.reject(new Error("Sandbox inspection is test-only"));
  const run = queue.then(() => once("", null, undefined, EXPRESSION_TIMEOUT_MS, { op: "test_environment_keys" }));
  queue = run.catch(() => {});
  return run as Promise<string[]>;
}

/** Stop the sandbox process (worker shutdown / tests). */
export function stopSandbox() {
  child?.kill();
  child = null;
}
