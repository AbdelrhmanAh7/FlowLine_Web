/**
 * Test fixture: a FRESH worker process (new Node process, new DB pool, nothing in memory) that processes queued runs
 * until it has processed the given run id. Used to prove AI connections persist and are resolved + decrypted
 * server-side at execution, with no key re-entry and no in-memory cache.
 */
import { db, pool } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import { claimNextRun, processRun } from "../../worker/runner";

async function main() {
  const target = process.argv[2];
  try {
    for (let i = 0; i < 200; i++) {
      const id = await claimNextRun(db, "fresh-process");
      if (!id) break;
      await processRun(db, id, "fresh-process");
      if (id === target) break;
    }
  } finally {
    await pool.end();
  }
}

// Like the worker on shutdown: release the sandbox and exit explicitly (timers/handles would keep it alive).
main().then(
  () => (stopSandbox(), process.exit(0)),
  (e) => (console.error(e), process.exit(1)),
);
