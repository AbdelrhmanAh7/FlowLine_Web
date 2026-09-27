import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EXPRESSION_MAX_DEPTH, EXPRESSION_MAX_LENGTH, EXPRESSION_TIMEOUT_MS, ExpressionError, VALUE_MAX_BYTES } from "./expression";

/** Heap cap for the sandbox process. */
export const SANDBOX_HEAP_MB = 128;

const CHILD = fileURLToPath(new URL("./sandbox-child.mjs", import.meta.url));

type Reply = { id: number; ok: true; json: string } | { id: number; ok: false; code: string; message: string };

let child: ChildProcess | null = null;
let nextId = 1;
let queue: Promise<unknown> = Promise.resolve();

function spawnChild() {
  const c = fork(CHILD, [], { execArgv: [`--max-old-space-size=${SANDBOX_HEAP_MB}`], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  c.on("exit", () => {
    if (child === c) child = null;
  });
  c.on("error", () => {});
  return c;
}

function once(source: string, input: unknown, timeoutMs: number): Promise<unknown> {
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
    c.send({ id, source, input, maxDepth: EXPRESSION_MAX_DEPTH, maxBytes: VALUE_MAX_BYTES });
  });
}

/**
 * Server-side (execution worker) evaluator. Runs JSONata in a separate, heap-capped
 * process with a hard kill on timeout, so no expression (runaway built-in,
 * catastrophic regex, huge allocation) can stall or crash the worker itself.
 * Evaluations are serialized through one sandbox process.
 */
export function evaluateIsolated(source: string, input: unknown, timeoutMs = EXPRESSION_TIMEOUT_MS): Promise<unknown> {
  if (source.length > EXPRESSION_MAX_LENGTH) {
    return Promise.reject(new ExpressionError("EXPRESSION_TOO_LONG", `Expression is longer than ${EXPRESSION_MAX_LENGTH} characters`));
  }
  const run = queue.then(() => once(source, input, timeoutMs));
  queue = run.catch(() => {});
  return run;
}

/** Stop the sandbox process (worker shutdown / tests). */
export function stopSandbox() {
  child?.kill();
  child = null;
}
